-- Bring the demo rows in an existing database up to date (run once, after 2026-10-21-listing-details-and-catalogue.sql).
-- Safe to run twice. It only renames old values and fills project details that are still empty, so edits made
-- through the app are kept.
begin;

-- 1. Topic names now come from a standard list (SRS updates row 12).
update project_listings set topic_tags = array_replace(topic_tags, 'HCI', 'Human-Computer Interaction') where 'HCI' = any(topic_tags);
update student_profiles set research_interests = array_replace(research_interests, 'HCI', 'Human-Computer Interaction') where 'HCI' = any(research_interests);
update self_proposed_applications set research_interests = array_replace(research_interests, 'HCI', 'Human-Computer Interaction') where 'HCI' = any(research_interests);
update project_listings set topic_tags = array_replace(topic_tags, 'NLP', 'Natural Language Processing') where 'NLP' = any(topic_tags);
update student_profiles set research_interests = array_replace(research_interests, 'NLP', 'Natural Language Processing') where 'NLP' = any(research_interests);
update self_proposed_applications set research_interests = array_replace(research_interests, 'NLP', 'Natural Language Processing') where 'NLP' = any(research_interests);
update project_listings set topic_tags = array_replace(topic_tags, 'Materials', 'Materials Science') where 'Materials' = any(topic_tags);
update student_profiles set research_interests = array_replace(research_interests, 'Materials', 'Materials Science') where 'Materials' = any(research_interests);
update self_proposed_applications set research_interests = array_replace(research_interests, 'Materials', 'Materials Science') where 'Materials' = any(research_interests);

-- 2. Made-up module codes replaced by real NTU courses.
update project_listings set prerequisites = array_replace(prerequisites, 'EE2004', 'EE2101') where 'EE2004' = any(prerequisites);
update student_profiles set completed_modules = array_replace(completed_modules, 'EE2004', 'EE2101') where 'EE2004' = any(completed_modules);
update project_listings set prerequisites = array_replace(prerequisites, 'EE3080', 'EE3015') where 'EE3080' = any(prerequisites);
update student_profiles set completed_modules = array_replace(completed_modules, 'EE3080', 'EE3015') where 'EE3080' = any(completed_modules);
update project_listings set prerequisites = array_replace(prerequisites, 'EE4483', 'EE4285') where 'EE4483' = any(prerequisites);
update student_profiles set completed_modules = array_replace(completed_modules, 'EE4483', 'EE4285') where 'EE4483' = any(completed_modules);
update project_listings set prerequisites = array_replace(prerequisites, 'SB2210', 'BS2004') where 'SB2210' = any(prerequisites);
update student_profiles set completed_modules = array_replace(completed_modules, 'SB2210', 'BS2004') where 'SB2210' = any(completed_modules);
update project_listings set prerequisites = array_replace(prerequisites, 'SB3101', 'BS3008') where 'SB3101' = any(prerequisites);
update student_profiles set completed_modules = array_replace(completed_modules, 'SB3101', 'BS3008') where 'SB3101' = any(completed_modules);
update project_listings set prerequisites = array_replace(prerequisites, 'SB3211', 'BS2030') where 'SB3211' = any(prerequisites);
update student_profiles set completed_modules = array_replace(completed_modules, 'SB3211', 'BS2030') where 'SB3211' = any(completed_modules);
update project_listings set prerequisites = array_replace(prerequisites, 'MA4826', 'MA4012') where 'MA4826' = any(prerequisites);
update student_profiles set completed_modules = array_replace(completed_modules, 'MA4826', 'MA4012') where 'MA4826' = any(completed_modules);
update project_listings set prerequisites = array_replace(prerequisites, 'AB2101', 'AB1202') where 'AB2101' = any(prerequisites);
update student_profiles set completed_modules = array_replace(completed_modules, 'AB2101', 'AB1202') where 'AB2101' = any(completed_modules);

-- 3. Project details for the seeded listings, only where none were added yet.
update project_listings set outcomes = 'Clean and split a public fundus dataset.
Train a CNN grader and compare it with a baseline.
Add saliency maps a clinician can read, and check calibration.
Write a short report and present a poster.', skills = 'PyTorch, model evaluation, explainability methods, scientific writing', hours_per_week = 8, mode = 'hybrid', gallery_urls = array['/gallery/lst-1-1.jpg','/gallery/lst-1-2.jpg','/gallery/lst-1-3.jpg']::text[], video_url = 'https://www.youtube.com/watch?v=aircAruvnKk'
  where id = 'lst-1' and outcomes = '' and gallery_urls = '{}';
update project_listings set outcomes = 'Review explanation methods for tabular clinical data.
Train a risk model on an open clinical dataset.
Build a small decision-support prototype with SHAP and counterfactual views.
Run a usability session with two clinicians and report what helped them.', skills = 'Explainable AI, user studies, Python, Streamlit', hours_per_week = 6, mode = 'on_site', gallery_urls = array['/gallery/lst-2-1.jpg','/gallery/lst-2-2.jpg']::text[]
  where id = 'lst-2' and outcomes = '' and gallery_urls = '{}';
update project_listings set outcomes = 'Simulate three hospital data silos from a public imaging dataset.
Implement federated averaging and one privacy defence.
Measure the accuracy and privacy trade-off.
Present the results at the lab meeting.', skills = 'Federated learning, differential privacy, experiment design', hours_per_week = 10, mode = 'remote', gallery_urls = array['/gallery/lst-3-1.jpg','/gallery/lst-3-2.jpg','/gallery/lst-3-3.jpg']::text[]
  where id = 'lst-3' and outcomes = '' and gallery_urls = '{}';
update project_listings set outcomes = 'Join two field trips to collect coral and water samples off Pulau Hantu.
Extract DNA and prepare 16S amplicon libraries.
Analyse diversity with QIIME 2 and relate it to bleaching surveys.', skills = 'Field sampling, DNA extraction, bioinformatics, R', hours_per_week = 10, mode = 'on_site', gallery_urls = array['/gallery/lst-4-1.jpg','/gallery/lst-4-2.jpg']::text[]
  where id = 'lst-4' and outcomes = '' and gallery_urls = '{}';
update project_listings set outcomes = 'Design a guide RNA library against candidate resistance genes.
Run the pooled knockout screen under two antibiotics.
Count guides by sequencing and rank genes by effect.', skills = 'Molecular cloning, CRISPR screening, sequencing analysis, lab safety', hours_per_week = 12, mode = 'on_site', gallery_urls = array['/gallery/lst-5-1.jpg','/gallery/lst-5-2.jpg']::text[], video_url = 'https://www.youtube.com/watch?v=jAhjPd4uNFY'
  where id = 'lst-5' and outcomes = '' and gallery_urls = '{}';
update project_listings set outcomes = 'Clean cycling data from coin cells tested in the lab.
Fit an equivalent-circuit model and a physics-informed degradation model.
Predict remaining useful life and compare the two models.', skills = 'Battery modelling, Python, curve fitting, uncertainty estimation', hours_per_week = 8, mode = 'hybrid', gallery_urls = array['/gallery/lst-6-1.jpg','/gallery/lst-6-2.jpg','/gallery/lst-6-3.jpg']::text[]
  where id = 'lst-6' and outcomes = '' and gallery_urls = '{}';
update project_listings set outcomes = 'Train a small arrhythmia classifier on the MIT-BIH dataset.
Quantise it and deploy it on a microcontroller.
Measure latency, accuracy and battery drain on the board.', skills = 'Embedded C, TinyML, signal processing, power measurement', hours_per_week = 8, mode = 'on_site', gallery_urls = array['/gallery/lst-7-1.jpg','/gallery/lst-7-2.jpg']::text[]
  where id = 'lst-7' and outcomes = '' and gallery_urls = '{}';
update project_listings set outcomes = 'Program three handover strategies on a collaborative robot arm.
Run a user study with 12 participants in the mock kitchen.
Analyse safety and comfort ratings and write up the findings.', skills = 'ROS 2, robot programming, user study design, statistics', hours_per_week = 10, mode = 'on_site', gallery_urls = array['/gallery/lst-8-1.jpg','/gallery/lst-8-2.jpg']::text[]
  where id = 'lst-8' and outcomes = '' and gallery_urls = '{}';
update project_listings set outcomes = 'Design silicone finger geometries in CAD and cast them.
Test grasp success on fruit of different firmness.', skills = 'CAD, moulding and casting, experimental testing', hours_per_week = 8, mode = 'on_site'
  where id = 'lst-9' and outcomes = '' and gallery_urls = '{}';
update project_listings set outcomes = 'Explore a year of air-quality readings and their missing values.
Build a hierarchical Bayesian model for the gaps.
Validate it against held-out NEA station data.', skills = 'Bayesian statistics, Stan or PyMC, spatial data, R or Python', hours_per_week = 6, mode = 'remote', gallery_urls = array['/gallery/lst-10-1.jpg','/gallery/lst-10-2.jpg']::text[]
  where id = 'lst-10' and outcomes = '' and gallery_urls = '{}';
update project_listings set outcomes = 'Annotate a small corpus of Malay and Tamil news headlines.
Fine-tune a multilingual transformer on it.
Test how well it transfers between the two languages.
Release the corpus and a short report.', skills = 'NLP, Hugging Face Transformers, annotation design, evaluation', hours_per_week = 8, mode = 'hybrid', gallery_urls = array['/gallery/lst-11-1.jpg','/gallery/lst-11-2.jpg','/gallery/lst-11-3.jpg']::text[], video_url = 'https://www.youtube.com/watch?v=eMlx5fFNoYc'
  where id = 'lst-11' and outcomes = '' and gallery_urls = '{}';
update project_listings set outcomes = 'Train a baseline movie recommender on MovieLens.
Measure how exposure is shared between popular and niche films.
Implement two re-ranking methods and compare fairness and accuracy.', skills = 'Recommender systems, fairness metrics, PyTorch, experiment tracking', hours_per_week = 6, mode = 'remote', gallery_urls = array['/gallery/lst-12-1.jpg','/gallery/lst-12-2.jpg']::text[]
  where id = 'lst-12' and outcomes = '' and gallery_urls = '{}';

-- 4. One cover per listing, no repeats (only where the old shared cover is still set).
update project_listings set cover_url = '/covers/cover-stethoscope.jpg' where id = 'lst-2' and cover_url = '/covers/cover-chat.jpg';
update project_listings set cover_url = '/covers/cover-petri.jpg' where id = 'lst-5' and cover_url = '/covers/cover-leaf.jpg';
update project_listings set cover_url = '/covers/cover-wearable.jpg' where id = 'lst-7' and cover_url = '/covers/cover-eye.jpg';
update project_listings set cover_url = '/covers/cover-gripper.jpg' where id = 'lst-9' and cover_url = '/covers/cover-robot.jpg';
update project_listings set cover_url = '/covers/cover-haze.jpg' where id = 'lst-10' and cover_url = '/covers/cover-atom.jpg';
update project_listings set cover_url = '/covers/cover-cinema.jpg' where id = 'lst-12' and cover_url = '/covers/cover-leaf.jpg';

commit;
