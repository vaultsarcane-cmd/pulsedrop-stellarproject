//! PulseDrop Assistance Request contract.
//!
//! Tracks urgent assistance payment requests on Stellar Testnet.
//! A creator opens a request for a specific recipient, amount, and
//! category; a funder marks it funded after sending XLM directly;
//! the creator can cancel an open request before it is funded.
//!
//! The contract itself never holds funds: it records intent and state
//! so the assistance flow stays transparent and auditable.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env, String, Vec,
};

/// Lifecycle of an assistance request.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RequestStatus {
    Open,
    Funded,
    Cancelled,
}

/// A single urgent assistance request.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssistanceRequest {
    pub id: u64,
    pub creator: Address,
    pub recipient: Address,
    /// Requested amount in stroops (1 XLM = 10,000,000 stroops).
    pub amount: i128,
    /// Category label such as "transit", "mobile-data", or "meal".
    pub category: String,
    /// Ledger number when the request was created.
    pub created_ledger: u32,
    /// Ledger number after which the request expires.
    pub expires_ledger: u32,
    pub status: RequestStatus,
}

/// Storage keys used by the contract.
#[contracttype]
enum DataKey {
    Count,
    Request(u64),
}

/// Emitted whenever a request changes state. Topics: "assistance", action.
#[contractevent(topics = ["assistance"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssistanceEvent {
    #[topic]
    pub action: String,
    pub request_id: u64,
    pub creator: Address,
    pub recipient: Address,
    pub amount: i128,
    pub category: String,
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum AssistanceError {
    /// Amount must be positive.
    InvalidAmount = 1,
    /// Expiry window is zero or too far in the future.
    InvalidExpiration = 2,
    /// Category label exceeds 32 bytes.
    CategoryTooLong = 3,
    /// No request exists with the given id.
    RequestNotFound = 4,
    /// Only the original creator may cancel this request.
    NotRequestCreator = 5,
    /// The request is no longer open.
    RequestNotOpen = 6,
    /// The request has already expired.
    AlreadyExpired = 7,
}

#[contract]
pub struct AssistanceContract;

#[contractimpl]
impl AssistanceContract {
    /// Number of ledgers after which an open request expires by default
    /// (~2 days at 5s ledger close).
    pub const DEFAULT_EXPIRY_LEDGERS: u32 = 34_560;

    /// Creates a new open assistance request and emits an `open` event.
    ///
    /// Returns the new request id. `amount` must be positive, the expiry
    /// must be in the future, and the category must stay within 32 bytes.
    pub fn create_request(
        env: Env,
        creator: Address,
        recipient: Address,
        amount: i128,
        category: String,
        expiry_ledgers: u32,
    ) -> Result<u64, AssistanceError> {
        creator.require_auth();

        if amount <= 0 {
            return Err(AssistanceError::InvalidAmount);
        }
        if expiry_ledgers == 0 || expiry_ledgers > Self::DEFAULT_EXPIRY_LEDGERS {
            return Err(AssistanceError::InvalidExpiration);
        }
        if category.len() > 32 {
            return Err(AssistanceError::CategoryTooLong);
        }

        let id = Self::_next_id(&env);
        let created_ledger = env.ledger().sequence();
        let request = AssistanceRequest {
            id,
            creator: creator.clone(),
            recipient: recipient.clone(),
            amount,
            category: category.clone(),
            created_ledger,
            expires_ledger: created_ledger + expiry_ledgers,
            status: RequestStatus::Open,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Request(id), &request);
        env.storage().persistent().set(&DataKey::Count, &id);

        AssistanceEvent {
            action: String::from_str(&env, "open"),
            request_id: id,
            creator,
            recipient,
            amount,
            category,
        }
        .publish(&env);

        Ok(id)
    }

    /// Marks an open, unexpired request as funded. Intended to be called
    /// by the funder right after sending XLM directly to the recipient.
    pub fn fund_request(env: Env, requester: Address, id: u64) -> Result<(), AssistanceError> {
        requester.require_auth();

        let mut request = Self::_get_request(&env, id)?;
        Self::_ensure_open(&env, &request)?;

        request.status = RequestStatus::Funded;
        env.storage()
            .persistent()
            .set(&DataKey::Request(id), &request);

        AssistanceEvent {
            action: String::from_str(&env, "funded"),
            request_id: id,
            creator: requester,
            recipient: request.recipient.clone(),
            amount: request.amount,
            category: request.category.clone(),
        }
        .publish(&env);

        Ok(())
    }

    /// Cancels an open request. Only the original creator may cancel,
    /// and only while the request is still open and unexpired.
    pub fn cancel_request(env: Env, requester: Address, id: u64) -> Result<(), AssistanceError> {
        requester.require_auth();

        let mut request = Self::_get_request(&env, id)?;
        if requester != request.creator {
            return Err(AssistanceError::NotRequestCreator);
        }
        Self::_ensure_open(&env, &request)?;

        request.status = RequestStatus::Cancelled;
        env.storage()
            .persistent()
            .set(&DataKey::Request(id), &request);

        AssistanceEvent {
            action: String::from_str(&env, "cancelled"),
            request_id: id,
            creator: requester,
            recipient: request.recipient.clone(),
            amount: request.amount,
            category: request.category.clone(),
        }
        .publish(&env);

        Ok(())
    }

    /// Reads one request by id.
    pub fn get_request(env: Env, id: u64) -> Result<AssistanceRequest, AssistanceError> {
        Self::_get_request(&env, id)
    }

    /// Reads the most recent `limit` requests, newest first.
    pub fn recent_requests(env: Env, limit: u32) -> Vec<AssistanceRequest> {
        let count = Self::_current_count(&env);
        let take = if limit as u64 > count {
            count
        } else {
            limit as u64
        };
        let mut out = Vec::new(&env);
        // Walk backwards from the newest id so no reversal is needed.
        let mut steps = 0u64;
        while steps < take {
            let id = count - steps;
            if let Some(request) = env
                .storage()
                .persistent()
                .get::<DataKey, AssistanceRequest>(&DataKey::Request(id))
            {
                out.push_back(request);
            }
            steps += 1;
        }
        out
    }

    /// Total number of requests ever created.
    pub fn total_requests(env: Env) -> u64 {
        Self::_current_count(&env)
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

    fn _next_id(env: &Env) -> u64 {
        Self::_current_count(env) + 1
    }

    fn _current_count(env: &Env) -> u64 {
        env.storage().persistent().get(&DataKey::Count).unwrap_or(0)
    }

    fn _get_request(env: &Env, id: u64) -> Result<AssistanceRequest, AssistanceError> {
        env.storage()
            .persistent()
            .get::<DataKey, AssistanceRequest>(&DataKey::Request(id))
            .ok_or(AssistanceError::RequestNotFound)
    }

    fn _ensure_open(env: &Env, request: &AssistanceRequest) -> Result<(), AssistanceError> {
        if request.status != RequestStatus::Open {
            return Err(AssistanceError::RequestNotOpen);
        }
        if env.ledger().sequence() >= request.expires_ledger {
            return Err(AssistanceError::AlreadyExpired);
        }
        Ok(())
    }
}

#[cfg(test)]
mod test;
