# Traceability: REQ-ID to code and tests

Update the row for every REQ-ID your PR touches. "Screen" is the dialog-map page; "Test" is the pytest name.

| REQ-ID | Slice | Endpoint | Screen | Test | Status |
|---|---|---|---|---|---|
| REG-1 | A | POST /auth/register | CreateAccountPage | test_REQ_REG_1_non_ntu_email_rejected | mock |
| REG-2 | A | POST /auth/verify | EmailVerificationPage | test_REQ_REG_2_correct_code_activates | mock |
| REG-3 | A | POST /auth/register | CreateAccountPage | test_REQ_REG_3_duplicate_email_rejected | mock |
| AUTH-1 | A | POST /auth/sign-in | SignInPage | SignInPage password reveal toggle | mock |
| AUTH-2 | A | deps.current_user | SignInPage | test_REQ_AUTH_2_inactive_account_cannot_act | mock |
| AUTH-3 | A | deps.current_user, web/lib/session.ts | all | web session expiry redirect | mock |
| PROF-1 | A | GET /me, PUT /me/profile | CompleteProfilePage | test_REQ_PROF_1_profile_marked_complete_after_save | mock |
| PROF-2 | A | PUT /me/profile | MyProfilePage | test_REQ_PROF_2_fields_saved | mock |
| PROF-3 | A | POST /me/documents | MyProfilePage | test_REQ_PROF_3_upload_pdf_stores_path | mock |
| USER-1 | A | POST /admin/users | CreateUserForm | test_REQ_USER_1_admin_creates_supervisor | mock |
| USER-2 | A | POST /admin/users | CreateUserForm | test_REQ_USER_2_register_cannot_choose_admin | mock |
| USER-3 | A | POST /admin/users/{id}/deactivate | ManageUsersPage | test_REQ_USER_3_deactivated_user_gets_403 | mock |
| BROWSE-1 | B | GET /listings | BrowseProjectPage | | todo |
| BROWSE-2 | B | GET /listings | BrowseProjectPage | | todo |
| BROWSE-3 | B | GET /listings | BrowseProjectPage | test_REQ_BROWSE_3_closed_listing_hidden_from_students | mock |
| PROJ-1 | B | POST /supervisor/listings | CreateProjectPage | | todo |
| PROJ-2 | B | PUT /supervisor/listings/{id} | EditProjectPage | | todo |
| PROJ-3 | B | PUT /supervisor/listings/{id} | EditProjectPage | test_REQ_PROJ_3_cannot_reduce_slots_below_matched | mock |
| PROPOSE-1..3 | B | POST /proposals | ProposeProjectPage | | todo |
| REVPROP-1 | B | GET /supervisor/proposals | StudentProposalPage | test_REQ_REVPROP_1_supervisor_sees_student_profile | mock |
| REVPROP-2 | B | POST /supervisor/proposals/{id}/accept | StudentProposalPage | test_REQ_REVPROP_2_accepting_registers_student | mock |
| REVPROP-3 | B | POST /supervisor/proposals/{id}/accept | StudentProposalPage | test_REQ_REVPROP_3_cannot_accept_after_cycle_closes | mock |
| APPLY-1 | C | POST /applications | ApplyProjectPage | | todo |
| APPLY-2 | C | POST /applications | ApplyProjectPage | test_REQ_APPLY_2_statement_required | mock |
| SRANK-1..2 | C | PUT /me/ranking | MyApplicationPage | test_REQ_SRANK_2_ranking_must_cover_every_active_application | mock |
| VRANK-1 | C | GET /supervisor/listings/{id}/applicants | ApplicantAndRankingsPage | test_REQ_VRANK_1_top_ten_flag_limited | mock |
| VRANK-2 | C | PUT /supervisor/listings/{id}/ranking | ApplicantAndRankingsPage | | todo |
| VRANK-3 | C | GET /documents/{id}/view | ApplicantAndRankingsPage drawer | | todo |
| CYCLE-1..3 | D | /admin/cycles | MatchingRoundsPage | | todo |
| ROUND-1..3 | D | PUT /admin/cycles/{id}/rounds | MatchingRoundsPage | | todo |
| EXEC-1 | D | POST /admin/rounds/{id}/execute | MatchingRoundsPage | test_REQ_EXEC_1_cannot_execute_before_review_window_ends | mock |
| EXEC-2 | D | POST /admin/rounds/{id}/execute | MatchingRoundsPage | test_REQ_EXEC_2_execute_once_then_publish_after_approvals | mock |
| EXEC-3 | D | services/matching/algorithm.py | | test_REQ_EXEC_3_zero_capacity_listing_skipped | mock |
| REV-1 | D | GET /admin/rounds/{id}/matches | MatchingAwaitPublishPage | | todo |
| PUB-1..2 | D | POST /admin/rounds/{id}/publish | MatchingAwaitPublishPage | test_REQ_EXEC_2_... | mock |
| ASSIGN-1..3 | D | /admin/matches/{id}/reassign, /admin/rounds/{id}/assign | MatchingAwaitPublishPage | test_REQ_ASSIGN_2_reassign_requires_justification | mock |
| APPRV-1..3 | D | /supervisor/matches/{id}/approve or reject | MatchApprovalsPage | | todo |
| OUTCOME-1..4 | D | /me/match/*, POST /internal/tick | MyApplicationPage | test_REQ_EXEC_2_... (decline) | mock |
| AUDIT-1..2 | D | services/audit.py, schema trigger | AuditOverridesPage | | todo |
| NOTIF-1..2 | E | /me/notifications | NotificationPage | | todo |

Status: `todo` (mock only), `live` (real Supabase behind it), `done` (live and tested).

