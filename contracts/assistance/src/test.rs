//! Unit tests for the PulseDrop Assistance Request contract.
//! Uses the generated contract client, matching the SDK 27 testing style.

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Env, String,
};

fn setup(env: &Env) -> AssistanceContractClient<'_> {
    let contract_id = env.register(AssistanceContract, ());
    AssistanceContractClient::new(env, &contract_id)
}

fn sample_category(env: &Env) -> String {
    String::from_str(env, "transit")
}

#[test]
fn create_request_stores_all_fields() {
    let env = Env::default();
    let client = setup(&env);
    env.mock_all_auths();
    let creator = Address::generate(&env);
    let recipient = Address::generate(&env);

    let id = client.create_request(
        &creator,
        &recipient,
        &5_000_000,
        &sample_category(&env),
        &1000,
    );
    let request = client.get_request(&id);

    assert_eq!(request.id, id);
    assert_eq!(request.creator, creator);
    assert_eq!(request.recipient, recipient);
    assert_eq!(request.amount, 5_000_000);
    assert_eq!(request.status, RequestStatus::Open);
    assert_eq!(request.expires_ledger, request.created_ledger + 1000);
}

#[test]
fn create_request_rejects_zero_amount() {
    let env = Env::default();
    let client = setup(&env);
    env.mock_all_auths();

    let result = client.try_create_request(
        &Address::generate(&env),
        &Address::generate(&env),
        &0,
        &sample_category(&env),
        &1000,
    );
    assert_eq!(result, Err(Ok(AssistanceError::InvalidAmount)));
}

#[test]
fn create_request_rejects_negative_amount() {
    let env = Env::default();
    let client = setup(&env);
    env.mock_all_auths();

    let result = client.try_create_request(
        &Address::generate(&env),
        &Address::generate(&env),
        &-1,
        &sample_category(&env),
        &1000,
    );
    assert_eq!(result, Err(Ok(AssistanceError::InvalidAmount)));
}

#[test]
fn create_request_rejects_zero_expiry() {
    let env = Env::default();
    let client = setup(&env);
    env.mock_all_auths();

    let result = client.try_create_request(
        &Address::generate(&env),
        &Address::generate(&env),
        &1_000_000,
        &sample_category(&env),
        &0,
    );
    assert_eq!(result, Err(Ok(AssistanceError::InvalidExpiration)));
}

#[test]
fn fund_request_marks_funded() {
    let env = Env::default();
    let client = setup(&env);
    env.mock_all_auths();

    let id = client.create_request(
        &Address::generate(&env),
        &Address::generate(&env),
        &5_000_000,
        &sample_category(&env),
        &1000,
    );
    client.fund_request(&Address::generate(&env), &id);

    let request = client.get_request(&id);
    assert_eq!(request.status, RequestStatus::Funded);
}

#[test]
fn fund_request_rejects_unknown_id() {
    let env = Env::default();
    let client = setup(&env);
    env.mock_all_auths();

    let result = client.try_fund_request(&Address::generate(&env), &99);
    assert_eq!(result, Err(Ok(AssistanceError::RequestNotFound)));
}

#[test]
fn cancel_request_by_creator_works() {
    let env = Env::default();
    let client = setup(&env);
    env.mock_all_auths();
    let creator = Address::generate(&env);

    let id = client.create_request(
        &creator,
        &Address::generate(&env),
        &3_000_000,
        &sample_category(&env),
        &1000,
    );
    client.cancel_request(&creator, &id);

    let request = client.get_request(&id);
    assert_eq!(request.status, RequestStatus::Cancelled);
}

#[test]
fn cancel_request_rejects_non_creator() {
    let env = Env::default();
    let client = setup(&env);
    env.mock_all_auths();

    let id = client.create_request(
        &Address::generate(&env),
        &Address::generate(&env),
        &3_000_000,
        &sample_category(&env),
        &1000,
    );

    // A different address tries to cancel someone else's request.
    let impostor = Address::generate(&env);
    let result = client.try_cancel_request(&impostor, &id);
    assert_eq!(result, Err(Ok(AssistanceError::NotRequestCreator)));
}

#[test]
fn funded_request_cannot_be_cancelled() {
    let env = Env::default();
    let client = setup(&env);
    env.mock_all_auths();
    let creator = Address::generate(&env);
    let funder = Address::generate(&env);

    let id = client.create_request(
        &creator,
        &Address::generate(&env),
        &2_000_000,
        &sample_category(&env),
        &1000,
    );
    client.fund_request(&funder, &id);

    let result = client.try_cancel_request(&creator, &id);
    assert_eq!(result, Err(Ok(AssistanceError::RequestNotOpen)));
}

#[test]
fn cancelled_request_cannot_be_funded() {
    let env = Env::default();
    let client = setup(&env);
    env.mock_all_auths();
    let creator = Address::generate(&env);
    let funder = Address::generate(&env);

    let id = client.create_request(
        &creator,
        &Address::generate(&env),
        &2_000_000,
        &sample_category(&env),
        &1000,
    );
    client.cancel_request(&creator, &id);

    let result = client.try_fund_request(&funder, &id);
    assert_eq!(result, Err(Ok(AssistanceError::RequestNotOpen)));
}

#[test]
fn get_request_rejects_unknown_id() {
    let env = Env::default();
    let client = setup(&env);
    env.mock_all_auths();

    let result = client.try_get_request(&42);
    assert_eq!(result, Err(Ok(AssistanceError::RequestNotFound)));
}

#[test]
fn open_request_cannot_be_funded_after_expiry() {
    let env = Env::default();
    let client = setup(&env);
    env.mock_all_auths();
    let funder = Address::generate(&env);

    let id = client.create_request(
        &Address::generate(&env),
        &Address::generate(&env),
        &2_000_000,
        &sample_category(&env),
        &10,
    );

    // Advance the ledger past the expiry window.
    let current = env.ledger().sequence();
    env.ledger().set_sequence_number(current + 20);

    let result = client.try_fund_request(&funder, &id);
    assert_eq!(result, Err(Ok(AssistanceError::AlreadyExpired)));
}

#[test]
fn recent_requests_returns_newest_first() {
    let env = Env::default();
    let client = setup(&env);
    env.mock_all_auths();

    for amount in [1_000_000, 2_000_000, 3_000_000] {
        client.create_request(
            &Address::generate(&env),
            &Address::generate(&env),
            &amount,
            &sample_category(&env),
            &1000,
        );
    }

    let recent = client.recent_requests(&2);
    assert_eq!(recent.len(), 2);
    // Newest (id 3, amount 3_000_000) comes first.
    assert_eq!(recent.get(0).unwrap().amount, 3_000_000);
    assert_eq!(recent.get(1).unwrap().amount, 2_000_000);
}

#[test]
fn total_requests_counts_creations() {
    let env = Env::default();
    let client = setup(&env);
    env.mock_all_auths();

    assert_eq!(client.total_requests(), 0);

    client.create_request(
        &Address::generate(&env),
        &Address::generate(&env),
        &1_000_000,
        &sample_category(&env),
        &1000,
    );

    assert_eq!(client.total_requests(), 1);
}
