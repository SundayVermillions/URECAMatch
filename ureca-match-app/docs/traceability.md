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
| BROWSE-1 | B | GET /listings | BrowseProjectPage | test_REQ_BROWSE_1_listings_visible_before_the_cycle_opens | mock |
| BROWSE-2 | B | GET /listings | BrowseProjectPage | test_REQ_BROWSE_2_filters_combine_with_and | mock |
| BROWSE-3 | B | GET /listings | BrowseProjectPage | test_REQ_BROWSE_3_closed_listing_hidden_from_students | mock |
| PROJ-1 | B | POST /supervisor/listings, PUT .../{id} (publish) | CreateProjectPage | test_REQ_PROJ_1_cannot_publish_after_cycle_closes | mock |
| PROJ-2 | B | PUT /supervisor/listings/{id} | EditProjectPage | test_REQ_PROJ_2_update_after_closing_date_rejected | mock |
| PROJ-3 | B | PUT /supervisor/listings/{id} | EditProjectPage | test_REQ_PROJ_3_slots_cannot_go_below_matched_students | mock |
| PROPOSE-1 | B | POST /proposals | ProposeProjectPage | test_REQ_PROPOSE_1_research_interests_required | mock |
| PROPOSE-2 | B | POST /proposals, GET /supervisors | ProposeProjectPage | test_REQ_PROPOSE_2_inactive_supervisor_rejected | mock |
| PROPOSE-3 | B | POST /proposals | ProposeProjectPage | test_REQ_PROPOSE_3_outside_application_window_rejected | mock |
| REVPROP-1 | B | GET /supervisor/proposals | StudentProposalPage | test_REQ_REVPROP_1_supervisor_sees_student_profile | mock |
| REVPROP-2 | B | POST /supervisor/proposals/{id}/accept | StudentProposalPage | test_REQ_REVPROP_2_accepting_registers_student | mock |
| REVPROP-3 | B | POST /supervisor/proposals/{id}/accept | StudentProposalPage | test_REQ_REVPROP_3_cannot_accept_after_cycle_closes | mock |
| APPLY-1 | C | POST /applications, DELETE /applications/{id} | ApplyProjectPage | test_REQ_APPLY_1_apply_after_window_rejected, test_REQ_APPLY_1_withdraw_after_window_rejected, test_REQ_APPLY_1_profile_incomplete_rejected, test_REQ_APPLY_1_cannot_withdraw_matched_application | mock |
| APPLY-2 | C | POST /applications | ApplyProjectPage | test_REQ_APPLY_2_statement_required, test_REQ_APPLY_2_document_must_belong_to_applicant | mock |
| SRANK-1..2 | C | PUT /me/ranking | MyApplicationPage | test_REQ_SRANK_1_order_persisted, test_REQ_SRANK_2_ranking_must_cover_every_active_application, test_REQ_SRANK_2_duplicate_ids_rejected | mock |
| VRANK-1 | C | GET /supervisor/listings/{id}/applicants | ApplicantAndRankingsPage | test_REQ_VRANK_1_top_ten_flag_limited, test_REQ_VRANK_1_at_most_ten_recommended, test_REQ_VRANK_1_min_cgpa_filter | mock |
| VRANK-2 | C | GET/PUT /supervisor/listings/{id}/ranking | ApplicantAndRankingsPage | test_REQ_VRANK_2_cannot_read_other_supervisors_ranking, test_REQ_VRANK_2_ranking_after_review_end_rejected | mock |
| VRANK-3 | C | GET /documents/{id}/view, GET /supervisor/applicants/{id} | ApplicantAndRankingsPage drawer | test_REQ_VRANK_3_other_student_cannot_view, test_REQ_VRANK_3_supervisor_of_applied_listing_can_view, test_REQ_VRANK_3_unrelated_supervisor_cannot_view, test_REQ_VRANK_3_drawer_for_closed_application_is_404, test_REQ_VRANK_3_view_returns_signed_storage_url | mock |
| CYCLE-1..3 | D | /admin/cycles (+ /{id}/close, /{id}/reopen, history) | MatchingRoundsPage | test_REQ_CYCLE_1_create_new_cycle_when_none_active, test_REQ_CYCLE_1_history_lists_past_and_active, test_REQ_CYCLE_1_close_then_reopen_restores_active_cycle, test_REQ_CYCLE_1_create_rejected_when_dates_overlap, test_REQ_CYCLE_2_cannot_change_opening_after_it_passed, test_REQ_CYCLE_3_closing_change_notifies_students | mock |
| ROUND-1..3 | D | PUT /admin/cycles/{id}/rounds | MatchingRoundsPage | test_REQ_ROUND_1_rounds_derived_sequentially, test_REQ_ROUND_2_only_future_rounds_change, test_REQ_ROUND_3_round_past_cycle_close_rejected | mock |
| EXEC-1 | D | POST /admin/rounds/{id}/execute | MatchingRoundsPage | test_REQ_EXEC_1_cannot_execute_before_review_window_ends | mock |
| EXEC-2 | D | POST /admin/rounds/{id}/execute | MatchingRoundsPage | test_REQ_EXEC_2_execute_once_then_publish_after_approvals | mock |
| EXEC-3 | D | services/matching/algorithm.py | | test_REQ_EXEC_3_zero_capacity_listing_skipped | mock |
| REV-1 | D | GET /admin/rounds/{id}/matches | MatchingAwaitPublishPage | test_REQ_REV_1_matches_filter_by_status | mock |
| PUB-1..2 | D | POST /admin/rounds/{id}/publish | MatchingAwaitPublishPage | test_REQ_EXEC_2_execute_once_then_publish_after_approvals | mock |
| ASSIGN-1..3 | D | /admin/matches/{id}/reassign, /admin/rounds/{id}/assign | MatchingAwaitPublishPage | test_REQ_ASSIGN_1_manual_assign_creates_match_and_audit, test_REQ_ASSIGN_2_reassign_requires_justification, test_REQ_ASSIGN_3_cannot_assign_already_assigned_student | mock |
| APPRV-1..3 | D | /supervisor/matches/{id}/approve or reject | MatchApprovalsPage | test_REQ_APPRV_1_cannot_approve_before_execute, test_REQ_APPRV_2_reject_frees_the_slot, test_REQ_APPRV_3_no_change_after_publish | mock |
| OUTCOME-1..4 | D | /me/match/*, POST /internal/tick | MyApplicationPage | test_REQ_OUTCOME_1_student_can_accept_offer, test_REQ_EXEC_2_...(decline), test_REQ_OUTCOME_3_unanswered_offer_times_out | mock |
| AUDIT-1..2 | D | services/audit.py, schema trigger | AuditOverridesPage | test_REQ_AUDIT_1_execute_and_publish_write_audit, test_REQ_AUDIT_2_audit_log_table_is_append_only | mock |
| NOTIF-1..2 | E | /me/notifications | NotificationPage | | todo |

Status: `todo` (mock only), `live` (real Supabase behind it), `done` (live and tested).

