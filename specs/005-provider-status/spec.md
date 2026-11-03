# Feature Specification: Provider Status Checks

**Feature Branch**: Not assigned

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "Add a provider status-checking tool for GitHub and Cloudflare with bounded retries, response validation, compact output, and offline tests."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Check an external provider's status (Priority: P1)

During a production incident, an operations engineer asks the assistant whether
GitHub or Cloudflare is experiencing an outage, to distinguish a provider
incident from an issue in the engineer's own environment.

**Why this priority**: Knowing whether a dependency is degraded helps the
operator choose the right investigation and response.

**Independent Test**: Provide a valid status response for each supported
provider and verify that the assistant returns the provider's status indicator
and description on one line. Omit the provider once and verify GitHub is used.

**Acceptance Scenarios**:

1. **Given** no provider is specified and GitHub's public status is available,
   **When** the operator asks the assistant to check provider status without
   providing credentials,
   **Then** the assistant reports GitHub's indicator and description on one line.
2. **Given** Cloudflare is specified and its status is available,
   **When** the operator asks the assistant to check provider status,
   **Then** the assistant reports Cloudflare's indicator and description on one line.
3. **Given** a provider outside the supported choices is specified,
   **When** the status check is requested,
   **Then** the assistant returns a clear input error without reporting a status.

### User Story 2 - Get a clear result when a provider status cannot be checked (Priority: P1)

When a provider's status cannot be retrieved or understood, an operations
engineer needs an explicit observation rather than an invented status or an
interrupted assistant response.

**Why this priority**: A failed status check must not mislead incident response
or prevent the operator from continuing the investigation.

**Independent Test**: Simulate timeouts, network failures, server errors, and
malformed status data without contacting external services. Verify retry
behavior for transient failures and a readable final result for each failure.

**Acceptance Scenarios**:

1. **Given** a status request times out, fails on the network, or receives a
   server error, **When** the assistant checks provider status, **Then** it
   makes exactly one additional attempt.
2. **Given** the additional attempt also fails, **When** the status check ends,
   **Then** the assistant returns a concise, readable error result and does not
   present the check as successful.
3. **Given** the status response is malformed or lacks a valid status
   indicator or description, **When** the assistant checks provider status,
   **Then** it returns a readable error result without retrying the invalid
   response.
4. **Given** a provider reports an error other than a server-side failure,
   **When** the assistant checks provider status, **Then** it returns a
   readable error result without retrying that response.

### Edge Cases

- Each attempt must stop waiting after five seconds; a timeout is treated as a
  transient failure eligible for the single additional attempt.
- An invalid response must not be summarized as a healthy or degraded status.
- A failed retry must not escape as an exception or be formatted as a successful
  status observation.
- Error results remain concise and fit on one line.
- A provider value outside GitHub and Cloudflare must not result in a request
  being made to an unlisted provider.
- A timeout occurs when one attempt has not completed within five seconds.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The assistant MUST let an operator request the current status of
  GitHub or Cloudflare when investigating a suspected external dependency issue.
- **FR-002**: The GitHub status MUST be checked when the operator does not name
  a provider.
- **FR-003**: The assistant MUST obtain provider status from each provider's
  public status information without requiring credentials.
- **FR-004**: A successful result MUST contain the status indicator and its
  description in a single concise line.
- **FR-005**: Each attempt to obtain status MUST stop after five seconds.
- **FR-006**: A timeout, network failure, or provider-side server failure MUST
  result in exactly one additional attempt; no further attempts are allowed.
- **FR-007**: A response MUST be accepted only when it includes a status
  indicator and description. If either is missing or invalid, or the provider
  reports an error other than a server-side failure, the assistant MUST NOT
  retry.
- **FR-008**: If the status cannot be obtained or validated after the permitted
  attempt, the assistant MUST return a readable, concise error result instead
  of throwing an exception or returning a success-shaped status.
- **FR-009**: Automated checks MUST cover a successful response, a timeout, and
  an invalid response using simulated responses without making network calls.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In all valid checks, the returned line contains both the requested
  provider's status indicator and description; omitted provider selection
  produces a GitHub result.
- **SC-002**: No individual status attempt waits longer than five seconds.
- **SC-003**: Eligible transient failures produce exactly one additional
  attempt, while malformed data and non-server HTTP errors produce none.
- **SC-004**: Every final failure is returned as a readable, one-line
  observation, and no failed check is presented as a valid provider status.
- **SC-005**: Success, timeout, and invalid-response behavior can be verified
  with automated checks that make zero external network calls.
- **SC-006**: In a review of ten representative results, at least nine
  operations engineers can distinguish a reported provider condition from a
  status check that could not be completed.

## Assumptions

- GitHub and Cloudflare are the only supported providers for this version;
  other providers are out of scope.
- Each provider's public status information is the authoritative source for
  that provider's reported condition.
- A timeout is a transient request failure and is therefore eligible for the
  single retry.
- Only network failures, timeouts, and server-side failures are retried. Other
  provider errors and invalid status information produce an error result
  without a retry.
- Status checks are observations only; they do not change provider or incident
  state.
