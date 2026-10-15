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
| CYCLE-1..3 | D | /admin/cycles (+ /{id}/close, /{id}/reopen, history) | MatchingRoundsPage | test_REQ_CYCLE_1_create_new_cycle_when_none_active, test_REQ_CYCLE_1_history_lists_past_and_active, test_REQ_CYCLE_1_close_then_reopen_restores_active_cycle, test_REQ_CYCLE_1_create_rejected_when_dates_overlap, test_REQ_CYCLE_2_cannot_change_opening_after_it_passed, test_REQ_CYCLE_3_closing_change_notifies_students, test_REQ_CYCLE_2_update_rejects_closing_before_opening, test_REQ_CYCLE_2_update_rejects_a_date_in_the_past, test_REQ_CYCLE_2_update_rejects_overlap_with_another_cycle, test_REQ_CYCLE_1_phase_between_rounds_follows_the_round_just_run | mock |
| ROUND-1..3 | D | PUT /admin/cycles/{id}/rounds | MatchingRoundsPage | test_REQ_ROUND_1_rounds_derived_sequentially, test_REQ_ROUND_2_only_future_rounds_change, test_REQ_ROUND_3_round_past_cycle_close_rejected, test_REQ_ROUND_2_started_round_cannot_be_removed, test_REQ_ROUND_2_unstarted_round_can_be_removed, test_REQ_ROUND_1_round_numbers_must_run_from_one, test_REQ_ROUND_3_closing_date_cannot_cut_into_a_round | mock |
| EXEC-1 | D | POST /admin/rounds/{id}/execute | MatchingRoundsPage | test_REQ_EXEC_1_cannot_execute_before_review_window_ends | mock |
| EXEC-2 | D | POST /admin/rounds/{id}/execute | MatchingRoundsPage | test_REQ_EXEC_2_execute_once_then_publish_after_approvals, test_REQ_EXEC_execute_uses_saved_rankings_and_applications | mock |
| EXEC-3 | D | services/matching/algorithm.py | | test_REQ_EXEC_3_zero_capacity_listing_skipped | mock |
| REV-1 | D | GET /admin/rounds/{id}/matches | MatchingAwaitPublishPage | test_REQ_REV_1_matches_filter_by_status | mock |
| PUB-1..2 | D | POST /admin/rounds/{id}/publish | MatchingAwaitPublishPage | test_REQ_EXEC_2_execute_once_then_publish_after_approvals, test_REQ_PUB_1_cannot_publish_before_matching_runs, test_REQ_PUB_1_cannot_publish_twice, test_REQ_PUB_2_every_application_gets_an_outcome, test_REQ_PUB_2_publish_saves_application_outcomes | mock |
| ASSIGN-1..3 | D | /admin/matches/{id}/reassign, /admin/rounds/{id}/assign | MatchingAwaitPublishPage | test_REQ_ASSIGN_1_manual_assign_creates_match_and_audit, test_REQ_ASSIGN_2_reassign_requires_justification, test_REQ_ASSIGN_3_cannot_assign_already_assigned_student, test_REQ_ASSIGN_1_unknown_student_rejected_not_500, test_REQ_ASSIGN_1_only_students_can_be_assigned, test_REQ_ASSIGN_1_closed_listing_rejected, test_REQ_ASSIGN_1_assign_counts_slots_already_held, test_REQ_ASSIGN_1_reassign_cannot_overfill_a_project, test_REQ_ASSIGN_1_assignment_into_a_published_round_is_offered_at_once, test_REQ_ASSIGN_3_assigned_student_is_not_matched_again | mock |
| APPRV-1..3 | D | /supervisor/matches/{id}/approve or reject | MatchApprovalsPage | test_REQ_APPRV_1_cannot_approve_before_execute, test_REQ_APPRV_2_reject_frees_the_slot, test_REQ_APPRV_3_no_change_after_publish, test_REQ_APPRV_2_rejection_reason_kept_and_admin_told | mock |
| OUTCOME-1..4 | D | /me/match/*, POST /internal/tick | MyApplicationPage | test_REQ_OUTCOME_1_student_can_accept_offer, test_REQ_EXEC_2_...(decline), test_REQ_OUTCOME_3_unanswered_offer_times_out, test_REQ_OUTCOME_2_declined_or_placed_students_are_not_matched_again, test_REQ_OUTCOME_1_accept_saves_slot_eligibility_and_withdrawals, test_REQ_OUTCOME_2_decline_saves_ineligibility, test_REQ_OUTCOME_4_timeout_saves_ineligibility | mock |
| AUDIT-1..2 | D | services/audit.py, schema trigger | AuditOverridesPage | test_REQ_AUDIT_1_execute_and_publish_write_audit, test_REQ_AUDIT_2_audit_log_table_is_append_only | mock |
| NOTIF-1 | E | GET /me/notifications, services/notify.py | NotificationPage, sidebar badge | test_REQ_NOTIF_1_only_recipient_sees, test_REQ_NOTIF_1_newest_first, test_REQ_NOTIF_1_supabase_reads_own_newest_first, test_REQ_NOTIF_1_supabase_inserts_rows | mock |
| NOTIF-2 | E | POST /me/notifications/{id}/read | NotificationPage | test_REQ_NOTIF_2_mark_read_updates_unread_count, test_REQ_NOTIF_2_supabase_mark_read_scoped_to_owner | mock |

Status: `todo` (mock only), `live` (real Supabase behind it), `done` (live and tested). Non-functional requirements are in the next section.

## Non-functional requirements (SRS section 5)

Checked on 14 Oct 2026 against `main` at `bf3196b`. `uv run pytest -q`: 264 passed. Every test named below passes. Section 5.5 (Business Rules) is empty in the SRS.

Method: **Test** (pytest), **Live** (measured on production), **Inspect** (code, configuration or documents reviewed).

| NFR | Requirement | Owner | Method | Evidence | Result |
|---|---|---|---|---|---|
| 5.1.1 | Listings fetched within 5 s during an Application Window | E | Live | `GET /listings`, 10 runs: median 1.42 s, slowest 1.52 s (see Live measurements) | Met: well under 5 s; measured while no window was open, which does not change this query |
| 5.1.1 | Visual feedback within 2 s of an interaction | E | Inspect | Busy labels on sampled forms, e.g. "Sending…" on Propose, "Saving…" on Profile | Partly met: sampled forms only; nothing measures 2 s; `web/e2e/full-cycle.spec.ts` is skipped |
| 5.1.1 | 5 MB document accepted and stored within 15 s, with progress shown | E (code: A) | Test, Inspect | `test_REQ_PROF_3_over_5mb_rejected`, `test_REQ_PROF_3_upload_pdf_stores_path`; `upload()` in `web/app/(student)/profile/page.tsx` | Partly met: 5 MB limit tested; upload time not measured (no writes on production); no progress or busy state shown |
| 5.1.2 | In-app within 1 min; e-mail dispatched within 15 min | E | Test, Live | `test_NFR_5_1_2_email_dispatched_on_notify`, `test_NFR_5_1_2_no_send_unless_mode_is_send`, `test_NFR_5_1_2_failed_send_keeps_notification`, `test_NFR_5_1_2_every_event_has_a_template`, `test_REQ_NOTIF_email_sends_html_and_text`; Resend dashboard screenshot, <date> | Partly met: both happen in the same request as the change; only the Resend account owner receives mail until a sender domain is verified |
| 5.1.3 | 1000 concurrent sessions at 5.1.1 response times | E | Live | none | Not met (unverified): no load test run |
| 5.1.3 | Peak final hour without losing a submission | E | Live | none | Not met (unverified): no load test run |
| 5.1.4 | Matching completes within 10 min of the Review Window closing | E (code: D) | Test, Inspect | `test_REQ_EXEC_1_*`, `test_REQ_EXEC_2_execute_once_then_publish_after_approvals`, `test_REQ_EXEC_3_zero_capacity_listing_skipped`; `match()` in `services/matching/algorithm.py` | Partly met: the run is an in-memory algorithm inside one request; it starts when an admin triggers it, not automatically at window close; no timing test on a large input |
| 5.1.4 | Read-only access stays available during a run | E (code: D) | Inspect | `execute()` runs inside one request; other requests are handled separately | Met: nothing locks reads |
| 5.2 | Preference and ranking data committed on submission | none | Inspect, Test | `SupabaseStore.save_applications()`, `save_ranking()` write before the response; `test_REQ_SRANK_1_order_persisted` (mock store) | Met by inspection; no Supabase-mode test |
| 5.2 | Services recover within 5 min after a crash | none | Live, Inspect | `GET /health` cold start 2.55 s (see Live measurements) | Partly met: the API is back in seconds, but cycles, rounds, matches and audit entries return to the seed |
| 5.2 | Daily backups, restorable within 4 h | none | Inspect | none | Not met (unverified): depends on the Supabase plan's backups; no restore tested |
| 5.3.1 | NTU or approved e-mail domains only | E (code: A) | Test | `test_REQ_REG_1_non_ntu_email_rejected` | Met |
| 5.3.1 | Session expires after 30 min of inactivity | E (code: A) | Test | `test_SRS_5_3_1_token_idle_session_expiry` | Met |
| 5.3.1 | Passwords stored only as salted hashes, never logged | E (code: A) | Inspect | Supabase Auth stores passwords; the API never stores or logs them in Supabase mode (`routers/auth.py`) | Met: mock mode keeps demo passwords in memory only |
| 5.3.2 | Every request authorised by role | E | Test | `test_NFR_5_3_2_role_matrix` (94 cases from `shared/openapi.json`), `test_NFR_5_3_2_every_endpoint_classified`, `test_REQ_OUTCOME_tick_*` | Met |
| 5.3.3 | Personal data only to admins and entitled supervisors | E (code: C, A) | Test, Inspect | `test_REQ_VRANK_3_*`, `test_REQ_APPLY_2_document_must_belong_to_applicant`, `test_REQ_PROPOSE_1_documents_must_belong_to_the_student`; `supabase/policies.sql` (RLS, private `documents` bucket) | Partly met: documents covered; no test that CGPA and modules stay hidden from other students |
| 5.3.3 | Handling complies with PDPA and NTU policy | E | Inspect | none | Not met: no written data-handling statement |
| 5.3.4 | Audit log append-only | E (code: D) | Test, Inspect | `test_REQ_AUDIT_2_audit_log_table_is_append_only` (checks the trigger in `schema.sql`), `test_REQ_AUDIT_1_audit_is_read_only_and_newest_first` | Partly met: trigger not tested against Supabase; audit entries are not yet written to Supabase |
| 5.3.4 | Reassignments attributable and retained | E (code: D) | Test | `test_REQ_ASSIGN_1_manual_assign_creates_match_and_audit`, `test_REQ_ASSIGN_2_reassign_requires_justification`, `test_REQ_AUDIT_1_execute_and_publish_write_audit` | Partly met: admin and time recorded; not retained in production, where audit entries live in memory |
| 5.4.1 | 99.9% monthly uptime in official periods | E | Live | none | Not met (unverified): no uptime monitor |
| 5.4.2 | Responsive on desktop sizes without clipping | E | Inspect | none | Not met (unverified): not yet checked; e2e spec skipped |
| 5.4.2 | Visual feedback for every interactive element | E | Inspect | see 5.1.1 feedback row | Partly met: document upload has none |
| 5.4.2 | Plain-language errors with a fix | E | Inspect | `ApiError` messages in routers | Partly met: `register()` in `routers/auth.py` returns "Supabase Auth error: …" with provider text on an unexpected failure |
| 5.4.3 | Reusable across cycles without code changes | E (code: D) | Test | `test_REQ_CYCLE_1_*` (10 tests), `test_REQ_ROUND_1_rounds_derived_sequentially` | Partly met: works in the API; new cycles are not persisted in Supabase mode |
| 5.4.3 | Dates changeable at run time without redeploy | E (code: D) | Test | `test_REQ_CYCLE_2_cannot_change_opening_after_it_passed`, `test_REQ_CYCLE_3_closing_change_notifies_students`, `test_REQ_ROUND_2_only_future_rounds_change` | Partly met: same as above |
| 5.4.4 | Code docs, API specification, setup guide | E | Inspect, Test | `docs/SETUP.md`, `docs/CONTRIBUTING.md`, `docs/architecture.md`, REQ-tagged docstrings; CI step "contract is up to date" regenerates `shared/openapi.json` | Met |

### Live measurements

Production API https://ureca-match-api.vercel.app, 14 Oct 2026 14:53 to 14:55 UTC, from Singapore with `curl`. GET requests only. One sign-in as `stu-1` beforehand (`POST /auth/sign-in`, which updates `last_login_at`). 10 runs each, all `200`.

| Endpoint | First run | Median, runs 2 to 10 | Slowest, runs 2 to 10 |
|---|---|---|---|
| `GET /health` (no database) | 2.55 s (cold start) | 0.32 s | 0.40 s |
| `GET /me` | 4.31 s | 3.31 s | 4.24 s |
| `GET /listings` (11 listings) | 1.41 s | 1.42 s | 1.52 s |

The API function runs in Vercel's default region `iad1` (Washington, US) and Supabase is in Singapore. `GET /me` makes about 5 sequential Supabase queries and `GET /listings` about 2, so both work out to roughly 0.6 s per query. That suggests the distance between the two regions is the main cost; this has not been tested.

## Open gaps

| Gap | NFR | Owner |
|---|---|---|
| Cycles, rounds, matches and audit entries are not persisted in `SupabaseStore` | 5.2, 5.3.4, 5.4.3 | D (audit writes: E) |
| No Supabase-mode test that rankings and applications are written before the response | 5.2 | C |
| Supabase backups and a restore test not set up | 5.2 | unassigned (5.2 has no owner) |
| No load test for 1000 sessions or the final-hour peak | 5.1.3 | E |
| No uptime monitor on `/health` | 5.4.1 | E |
| Document upload shows no progress or busy state; upload time not measured | 5.1.1, 5.4.2 | A |
| `GET /me` takes about 3.3 s; API region `iad1` is far from the Singapore database | 5.1.1 | E |
| Matching starts on an admin action, not at Review Window close; no timing test on a large input | 5.1.4 | D |
| No test that CGPA and modules stay hidden from other students | 5.3.3 | C |
| No written PDPA and NTU data-handling statement | 5.3.3 | E |
| Audit trigger not tested against Supabase | 5.3.4 | D |
| `register()` shows provider error text to users | 5.4.2 | A |
| Responsiveness and feedback not checked; `web/e2e/full-cycle.spec.ts` skipped | 5.1.1, 5.4.2 | E |
| E-mail only reaches the Resend account owner until a sender domain is verified | 5.1.2 | E |

