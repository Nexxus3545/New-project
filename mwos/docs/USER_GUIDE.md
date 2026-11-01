# MWOS System Usage and Interface Guide

TMC Copino Birthing Home and Medical Clinic

User manual and manuscript reference

1 November 2026

This guide explains how visitors, patients, administrators, doctors, nurses, and midwives use the Maternal Wellness and Operations System. It describes the purpose of each section, the controls a user can select, the information entered or viewed, and the result of each principal action. It also identifies functions that depend on account permissions, clinic review, device capabilities, or an external service.

The guide covers the public website, account access, the clinic workspace, the patient portal, settings, and supporting pages reached through dashboard links. The final sections provide end-to-end procedures, current functional boundaries, and prose suitable for a manuscript discussion of system operation.

System address: https://tmc-copino-mwos.vercel.app/

Documentation baseline: the November 2026 workflow completion release, including clinical records, payment ledgers, pharmacy pickup, and referral coordination. Screen content and available records vary by account role and clinic configuration.

## 1 System organization and user responsibilities

MWOS organizes clinic information around the signed-in user. Visitors can browse public clinic information. Patients can manage their own requests and review their own records. Administrators manage access and coordination. Doctors, nurses, and midwives use the clinical workspace according to their assigned permissions and verified credentials. Seeing a menu does not automatically authorize every action inside it; the server may require a particular role, current credentials, or additional sign-in verification.

| User | Main responsibilities | Important access condition |
| Visitor | View clinic information, contact links, platform setup, FAQs, and public feedback. | Sign-in is required before opening personal care information. |
| Patient | Maintain personal details, submit one ID, request visits and consultations, read records, and communicate with the clinic. | Access is limited to the patient's linked account and authorized conversations. |
| Doctor | Review patients and perform permitted clinical documentation and consultation actions. | A current professional credential and additional verification may be required. |
| Nurse or midwife | Support patient care, observations, follow-up, and assigned consultations. | Clinical access depends on role, assignment, and credential review. |
| Administrator | Review accounts and credentials, organize schedules, inspect activity, and coordinate services. | Administrative access does not itself establish a professional license. |

When no active, verified doctor, nurse, or midwife is available, Telehealth offers an active administrator as Admin · Clinic coordinator. This option supports requests, scheduling, and video coordination. Once eligible clinical professionals are available, they become the choices for new requests. Existing coordinator assignments can still be completed.

## 2 Common navigation and controls

After sign-in, the sidebar groups pages by purpose. Selecting a menu item opens that workspace. On a smaller screen, use the menu control to open or close the sidebar. The account area identifies the signed-in user and provides Account settings and Sign out. Sign out ends access on that browser session; it does not delete the account or patient record.

| Control pattern | How it is used | Meaning of the result |
| Menu item or linked card | Select its label once. | Opens a page, section, or related record. |
| Search field | Enter the requested name, code, or keyword. | Narrows available results; a blank list may mean no match. |
| Select or dropdown | Open it and choose a listed option. | Changes the selected patient, provider, filter, or field value. |
| Calendar or date field | Select a valid date and, where required, a time. | Supplies a requested or confirmed schedule, depending on the form. |
| Save, Submit, or Create | Complete required fields and select the action. | Saves only after the system accepts the request and displays success. |
| Cancel, Close, or X | Dismiss the open form or dialog. | Usually exits without submitting unsaved edits. |
| Refresh, Retry, or Try again | Use after a loading or connection error. | Requests the information again; it does not create a duplicate record. |
| Status badge | Read the label beside the record. | Communicates a state; most badges are not buttons. |
| Disabled control | Read the nearby explanation and complete prerequisites. | May indicate missing information, loading, permission limits, or service unavailability. |

Read the patient name and identifying information before saving clinical data. A chart, photograph, counter, or decorated card is not necessarily clickable. A completed submission is different from an approved appointment, verified credential, successful payment, or dispatched transport.

## 3 Public website sections

The homepage introduces TMC Copino and directs visitors to the secure portal. The header contains the clinic identity, section links, and Book a visit. Selecting the logo returns to the homepage. Menu opens navigation on narrow screens, while Close dismisses it. Skip to content moves directly to the main page content for keyboard navigation.

| Section or link | Action available | Purpose and destination |
| Our care | Select the navigation link or Explore maternal care. | Moves to the service overview for prenatal care, birth preparation, postnatal follow-up, and mother and newborn care. |
| Request a visit | Select the link on a service card. | Opens the appointment entry flow through the secure portal. |
| The clinic | Select the link and use the photo-tour controls. | Shows photographs of the clinic's reception, examination room, birthing room, recovery area, and ward. |
| Hours & contact | Select the header link. | Shows published contact details and links for telephone, email, Facebook, and Google Maps. |
| Your visit | Read the three-step explanation and select Request an appointment. | Explains account access, requesting a visit, and waiting for confirmation. |
| View care team in the portal | Select the linked action. | Opens the role-appropriate secure destination; patients can browse provider information after sign-in. |
| Patient and visitor feedback | Read published comments and select Share feedback about MWOS. | Opens the review section of the Download Center. |
| FAQs | Select a question. | Expands its answer; select it again to collapse the answer. |
| Downloads | Select the navigation link or a platform card. | Opens installation guidance or the Download Center. |
| Book a visit or Book an appointment | Select either main action. | Starts the appointment flow and requests sign-in when necessary. |

Scrolling moves through these sections with fading and motion effects. The content remains part of one page. Reduced-motion preferences may change the animation behavior. The footer repeats clinic contact links and Download Center access. Telephone and email links open the appropriate device application; Facebook and map links open external services.

## 4 Facility photographs and clinic tour

The clinic tour presents supplied facility photographs as orientation material. Previous clinic photo and Next clinic photo move through the images. The numbered room selectors open a particular image. Pause tour stops automatic cycling; Play tour resumes it. Manual viewing appears when automatic motion is disabled by the user's reduced-motion preference.

| Photograph | Visible facility identification | Related system use |
| Reception | Information desk and visitor seating. | Patient intake, registrations, and appointment orientation. |
| Consultation | Examination couch, examination lamp, sink, and supplies. | Consultation, prenatal monitoring, laboratory review, and examinations. |
| Birthing room | Delivery table, maternal bed, and newborn bassinet. | Labor and delivery documentation. |
| Recovery | Shared ward with two visible patient beds and IV stands. | Recovery and postnatal orientation. |
| Ward room | Ward view with one visible bed and a door marked Ward Room 2 CR. | Postnatal and ward orientation. |

These are facility descriptions based on the supplied photographs. They do not show live occupancy, bed reservations, current equipment condition, or real-time service availability. Photographs inside module headers provide context and do not create patient records when selected.

## 5 Download Center and platform access

The Windows, Android, macOS, and iOS cards open the corresponding setup section. MWOS uses the same account and online care workspace across supported browsers and the installed web app. Installation support depends on the browser and device; the page provides platform-specific instructions when a direct installation prompt is unavailable.

| Clickable control | How to use it | Expected result |
| Clinic homepage | Select the back link or clinic identity. | Returns to the public website. |
| Explore your options | Select the link near the introduction. | Moves to the platform choices. |
| Open Web Version or Open MWOS | Select the action. | Opens the role-appropriate portal or sign-in page. |
| Create an account | Select the link. | Opens patient registration. |
| Set up on Windows, Android, macOS, or iOS | Select the relevant platform. | Moves to that device's installation guidance. |
| Install MWOS | Select it when offered, then confirm through the browser. | Installs the web app if the browser supports the installation flow. |
| Platform instructions | Follow the instructions displayed for the device. | Adds browser-based access where supported; it is not proof of a native store release. |
| Rating buttons from 1 to 5 | Select the rating in Leave a review. | Sets the rating to accompany the feedback form. |
| Submit Review | Enter the display name, role, rating, and feedback, then submit. | Sends feedback to the review system; publication follows its processing rules. |

Internet access and sign-in are required for the care workspace. Do not describe the platform cards as downloadable signed Windows, macOS, Android, or iOS installers unless a corresponding release is actually supplied. Public reviews should discuss the system experience without including patient records, ID numbers, passwords, or private clinical details.

## 6 Sign in registration and account recovery

Open the Login page and enter the account email and password. Sign in securely authenticates the account and opens the permitted workspace. Show reveals the typed password; Hide conceals it again. Sign in with passkey uses a previously registered, supported passkey. Continue with Google is available when the clinic's Google sign-in service is enabled. A disabled provider button should not be interpreted as a working alternative login method.

Patient registration uses Patient Info, Contact, Access, and Review steps. Enter the name, date of birth, gender and care information, email, and other requested contact details. Create a password and review the information before submitting. The public form creates a patient account; it does not allow a visitor to self-assign a clinical or administrator role.

| Link or control | User action | Expected result |
| Create your secure account | Open registration from Login. | Displays the patient registration steps. |
| Registration step buttons and navigation | Complete each step and move forward or back. | Preserves the form while allowing correction before account creation. |
| Forgot password? | Enter the account email and select Send reset link. | Requests the recovery process; follow the delivered link if available. |
| Reset password | Enter a valid new password using the recovery link. | Updates the password if the reset token is accepted. |
| Request reactivation | Open the reactivation page for an eligible deactivated account. | Starts email verification for restoration of access. |
| Send reactivation code | Enter the existing account email. | Requests a verification code. |
| Verify and reactivate | Enter the received code. | Restores access when the account and verification qualify. |
| Start again | Restart the reactivation form. | Clears the current recovery attempt in the interface. |
| Back to the clinic homepage or Sign in | Select the relevant return link. | Returns to the homepage or Login. |

New and changed passwords must contain at least eight characters, a letter, a number, and a symbol. The displayed checklist reports whether the requirements are met. A space alone does not satisfy the symbol requirement. Error messages must be resolved before submission succeeds. Never include actual account passwords in a manuscript or demonstration screenshot.

## 7 Clinic dashboard and daily coordination

The clinic Dashboard combines patient summaries, appointments, document review, activity indicators, charts, and media publication. Counters summarize the available data; charts support review rather than direct editing. Search accepts patient or clinic-related keywords and displays matching items when available. Refresh reloads dashboard information, and Retry repeats a failed request.

| Dashboard control | Action and result |
| Add Patient | Opens Patients, where a new intake can be registered. |
| View beside a recent patient | Opens that patient's detailed record. |
| Calendar Prev and Next | Changes the displayed month. |
| Calendar day | Selects the day for reviewing or booking appointments. |
| Book appointment | Uses the selected patient, provider, type, date, time, and notes to submit a booking. |
| Open uploaded file | Opens a submitted supporting document for authorized review. |
| Verify or Reject | Records the review decision for that pending medical document. Government-ID verification has a separate credentials workflow. |
| Upload Media | Opens the media publication dialog. |
| Publish Media | Sends the title, category, caption, media type, uploaded file or remote URL, and optional poster information. |
| Publish immediately checkbox | Determines the publication choice supplied with the media entry. |
| Close or Cancel in the media dialog | Exits the dialog without publishing the current form. |

The media form supports an image or video file and an alternative remote media URL. The progress indicator shows transfer activity, and an error must be resolved before publication is considered complete. Patient-facing media is viewed through the patient dashboard. Backup & Recovery offers Download clinic data for administrators after additional verification. The JSON extract includes clinical and operational records but excludes passwords, identity-document numbers, and uploaded files. On a configured local server, Download database backup produces a PostgreSQL archive. Production recovery is managed through the database provider; the web app does not restore the live database.

Suggested daily sequence: review today's schedule, check pending requests and documents, locate the correct patient, complete the permitted work, and confirm the resulting status before moving to another record.

## 8 Patient registration and search

Open Patients to search existing records or select + Register Patient. The search accepts the information indicated in its placeholder, including name, birthing ID, patient code, phone, or PhilHealth ID. Select View in the results to open a patient. Summary cards show counts for the currently loaded patient set and should not automatically be treated as a complete census.

The registration wizard contains four steps. Identity captures names, birth information, gender, care type, and personal details. Contact captures reachability, address, and emergency contact. Records holds clinic references and insurance details. Clinical contains biometrics, risk information, allergies, conditions, medications, and notes. Use the forward and back controls to complete or correct the form, then submit the final registration action.

| Step | Main information | Completion requirement |
| Identity | Name, birth date, personal and care information. | First name, last name, and date of birth are required by the intake form. |
| Contact | Phone or email, address, emergency contact, and relationship. | Provide at least one contact method. |
| Records | Birthing reference, PhilHealth information, booklet reference, and other clinic fields. | Enter available information accurately; missing information should not be invented. |
| Clinical | Height, weight, blood type, allergies, conditions, medication history, risk level, and notes. | Clinical entries require authorized staff judgment and applicable permissions. |

Cancel or Close exits the wizard. A validation message identifies missing or unacceptable information. Creating an intake record and creating a sign-in account are different operations; a patient record alone should not be assumed to include new login credentials. Identity-document files are submitted through the private credentials section rather than ordinary medical-document uploads.

## 9 Patient detail tabs

Open Patients, select a patient using View, and verify the header before using the tabs. Back returns to the patient list. The header shows identifiers and selected clinical summary information, while an active-pregnancy banner appears when a linked pregnancy is available.

| Tab | Information or controls | Result and boundary |
| Overview | Latest Vitals, Upcoming Appointments, and Medical History. | Reviews saved information without automatically changing it. |
| Vitals | History and a Record Vitals form. | Save Vitals submits a dated observation for this patient. |
| Pregnancies | Pregnancy history, Add pregnancy, and Edit pregnancy. | Saves LMP, EDD, obstetric history, status, risk level, and notes. Only one active pregnancy is permitted per patient. |
| Labs | Laboratory Results. | Shows saved tests, dates, results, and status. |
| Prescriptions | Medication history and Add prescription. | Authorized staff save medication, dose, frequency, route, duration, and instructions; patients read their own prescriptions. |
| Deliveries | Delivery Records. | Shows delivery date, type, newborn information, APGAR values, and recorded attendant where available. |
| Billing | Billing History. | Shows service, amount, recorded PhilHealth amount, and payment status. |

The compact Vitals form accepts visit date, systolic and diastolic blood pressure, weight, fetal heart rate, fetal movement, and notes. Save Vitals records the entry when accepted. Validation and care flags may be displayed afterward. The broader Prenatal Monitoring page provides additional observation fields.

The patient selected in this page remains the context for its tabs. Switching tabs changes the displayed dataset; it does not switch to another patient. If a record is empty, the page can show an empty-state message instead of a history table.

## 10 Clinic appointments

Appointments provides a calendar, appointment summaries, a list for the visible calendar period, and booking forms. The calendar retrieves every page of bookings in that period. Prev and Next move between months. Selecting a calendar day updates the day context. Use selected day copies that date into the booking form. Book this day starts a booking for the selected date, and + Schedule Appointment opens the scheduling dialog.

| Control | Required action | Result |
| Patient and Type | Select the patient and visit type. | Associates the booking with a patient and service category. |
| Date and Time | Enter the intended schedule. | Supplies the proposed appointment time. |
| Notes | Add preparation or coordination information as appropriate. | Stores accompanying booking notes. |
| Schedule | Submit the completed form. | Creates an appointment if validation and authorization succeed. |
| Accept appointment | Review the date, time, patient, and notes, then accept. | Updates the request to confirmed after conflict checking. |
| Reschedule | Enter a revised future date and time and a clinic note. | Saves the revised schedule after conflict checking. |
| Add portal reminder | Select for a future confirmed visit. | Adds one in-app patient notification per appointment schedule; this does not send SMS. |
| Mark no-show | Record that the expected patient did not attend. | Closes the appointment as no_show. |
| Mark done | Use after the recorded visit has been completed. | Updates the appointment to completed. |
| Cancel on an appointment | Use when cancelling that booking is intended. | Updates the appointment's status. |
| Cancel or Close in a form | Exit the form. | Does not itself cancel a previously saved appointment. |

Visit categories include general checkup, follow-up, laboratory result review, prenatal, postnatal, postpartum, and delivery where offered. Read the displayed status: scheduled indicates a recorded booking awaiting the applicable clinic action, confirmed indicates readiness, and completed, cancelled, or no show describes the recorded outcome. Patient requests still require clinic review. The explicit Check availability and Accept consultation procedure belongs to Telehealth and should not be attributed to every appointment form.

## 11 Prenatal monitoring

Open Prenatal Monitoring and choose the patient from Select patient. Refresh panel reloads the displayed observations. The page includes blood-pressure trends, maternal and fetal response charts, recent vitals history, a new-entry form, and care flags. Charts summarize stored readings; they do not measure the patient automatically.

The new-entry form includes visit date, gestational age in weeks, weight, height, systolic and diastolic blood pressure, pulse, temperature, respiratory rate, fundal height, fetal heart rate, fetal presentation, fetal movement, edema, and notes. Use the units shown beside each field. Confirm the selected patient and date, enter the applicable measured observations, and select Save vitals entry.

| Control or area | User operation | Expected result |
| Select patient | Choose the intended patient. | Loads the patient's history and establishes the destination of a new entry. |
| Refresh panel | Select after a relevant update or recoverable loading problem. | Retrieves current panel data. |
| Fetal movement and Edema | Choose the recorded observation. | Includes the chosen value in the submission. |
| Save vitals entry | Submit valid measurements and notes. | Saves a new observation and refreshes relevant history when accepted. |
| Latest care flags | Review the displayed messages. | Supports follow-up review; it is not an autonomous clinical diagnosis. |

Only enter findings obtained through the clinic's actual care process. A calculated category or flag should be interpreted by a qualified professional. Patients see recorded readings in their own portal and do not use this staff form to overwrite clinical measurements.

## 12 Postnatal monitoring and labor and delivery

Labor & Delivery and Postnatal Monitoring are separate workspaces. Select the patient first. Facility photographs identify the care area without claiming live bed occupancy.

| Labor control | Operation and result |
| Add pregnancy or Edit pregnancy | Record LMP, EDD, obstetric history, risk level, status, and notes. |
| New labor / delivery record | Select the active pregnancy and choose Labor admission or Completed birth. |
| Save record | Save the linked admission or delivery with date, type, newborn measurements, APGAR values, and notes. |
| Update / complete birth | Complete an existing labor record; a completed birth marks its pregnancy delivered. |
| Open observations | Open the time-ordered observation history and cervical-dilation chart. |
| Record labor observation | Enter observation time, relevant measurements, clinician assessment, care plan, and notes; then save. |

The chart displays recorded observations and does not automatically prescribe intervention. Zero APGAR values are retained. Entries that link another patient's pregnancy are rejected. Administrator entries are identified by their administrative role and do not acquire a clinician's license or clinical signature.

In Postnatal Monitoring, choose the patient and Add postnatal visit. Select a completed delivery, enter visit date, days postpartum, blood pressure, temperature, wound status, lochia, breastfeeding status, emotional wellbeing, and assessment or follow-up notes. Save record persists the visit and refreshes its history. Cancel exits without saving.

## 13 Pediatric monitoring and immunizations

Pediatric Monitoring maintains newborn records and dated follow-up visits. Choose the parent patient, then Add newborn record. Select the completed delivery and enter the baby's name, birth order for multiple births, birth date, sex, weight, and notes. Each birth order may be registered only once for a delivery.

Select Newborn for follow-up, then Add pediatric visit. Enter date, weight, length or height, head circumference, temperature, feeding and development observations, clinician assessment, care plan, and follow-up date. Save record stores the visit for that newborn. The patient Baby / Newborn section provides read-only access to the linked records.

Open immunizations leads to the vaccine register. Choose the patient, enter vaccine name, dose number, date given, optional due date, optional related delivery from the dropdown, and notes. Save immunization adds the entry and refreshes history. Total doses counts saved administration records, rather than adding the ordinal dose numbers. Due dates are recorded follow-up references and do not by themselves prove delivery of a reminder or administration of a dose.

## 14 Medical records and examinations

Medical Records opens the Examinations page. Select the patient before entering or reviewing findings. Two principal areas are available: laboratory results and ultrasound records. Each has its own form and saved-history display.

| Form or action | Information entered | Expected result |
| New laboratory entry | Test name, test date, status, result value, unit, reference range, and notes. | Prepares a laboratory record for the selected patient. |
| Save lab result | Submit the laboratory form. | Saves the result if the patient, required fields, credentials, and permissions are accepted. |
| New scan entry | Scan date, gestational age, findings, placenta location, amniotic fluid, and notes. | Prepares a recorded ultrasound finding. |
| Save ultrasound | Submit the scan form. | Saves the ultrasound entry and refreshes its history. |
| Select patient | Choose a different patient. | Replaces the displayed laboratory and ultrasound histories with that patient's records. |

Laboratory status choices identify the recorded interpretation, such as normal, abnormal, critical, or pending. The system does not perform the laboratory test or ultrasound examination. Recorded findings must come from the relevant clinical source. Patients review their own results through Health Records, and medical-document uploads are managed through Profile.

## 15 Messages and care coordination

Messages separates ongoing conversations from the consultation workflow. New message opens a conversation form. A patient enters a Subject and Message for the clinic. Staff may also choose the conversation type, priority, related patient, participants, subject, and opening message. Create conversation submits the new thread, while Cancel or Close exits the dialog.

| Clickable control | Use and outcome |
| Conversation in the list | Opens the selected thread and its message history. |
| New message | Opens a new-conversation dialog appropriate to the user's role. |
| Participant checkbox | Adds or removes a permitted participant while creating the thread. |
| Message category | Classifies an update where available. |
| Reply and Send reply | Sends the typed response to the open thread. |
| Add to medical record | Allows an authorized user to promote a suitable message into the clinical record through a protected action. |
| Create conversation | Creates the thread after required information and access checks pass. |

Unread counts indicate conversation activity. A sent message is not evidence that a clinician has read it or that an urgent response is underway. Before sending, check the selected conversation and patient context. Sensitive case discussion belongs in authorized conversations rather than public feedback.

A supplementary Care Hub page remains reachable at /interactions for staff. It offers New conversation, Assign task, Show completed or Hide completed, Start, Mark complete, and Promote to record. A task can contain an assignee, priority, related patient, due date, details, and an optional patient-visibility setting. This is a secondary route rather than a standard sidebar item. Use the dedicated Telehealth page for the current embedded video workflow.

## 16 Telehealth request and schedule review

Telehealth provides consultation requests, administrative schedule review, consultation history, device checks, and an embedded video call. Patients open it from their own sidebar; clinic staff open it from the clinic workspace. Request consultation opens the request form. The patient enters a title, concern, preferred date and time, duration, and an available provider or clinic coordinator. Staff also select the related patient and may supply a confirmed schedule where permitted.

| Request control | Purpose |
| Patient | Selects the related patient when the form is used by staff. |
| Provider or clinic coordinator | Selects an eligible clinical professional or the temporary administrative fallback. |
| Consultation title | Supplies a short description such as a follow-up discussion. |
| Preferred date and time | Records the patient's preferred future schedule; it does not approve it. |
| Confirmed schedule | Allows an authorized clinic user to supply an actual schedule where offered. |
| Consultation duration | Selects the proposed duration from the available choices. |
| Reason for consultation | States the concern or follow-up needed. |
| Submit request | Saves the request after validation. |

In the admin review area, select a request, review the patient and provider, choose the confirmed date and time and duration, then select Check availability. If the time overlaps an existing booking, choose another slot and check again. Accept consultation becomes usable only when the relevant availability review succeeds. Acceptance is rechecked on the server so that a stale availability result does not alone authorize a conflicting booking.

The consultation list can be narrowed using Status. Selecting a consultation opens its details and updates. Open consultation messages opens the conversation associated with that consultation. Requested means awaiting confirmation; Scheduled means the clinic has supplied an accepted schedule; Active means recorded as in progress; Completed and Cancelled close the consultation. Schedule summaries identify Manila time, while date-time inputs use the device's displayed time zone. Verify the device time zone before accepting a slot.

## 17 Telehealth camera and live consultation

The Camera & microphone check helps the user test local devices before a call. Check camera & microphone requests access to both; Check microphone only requests audio access. Turn camera off or on and Mute or Unmute microphone adjust the preview. Stop devices releases preview devices, while Cancel device check cancels a pending check. A successful preview is not a connection to another participant.

When the consultation is joinable, select Join video consultation. The system requests admission to the private room and opens the video experience inside MWOS. Both authorized participants must join their assigned consultation. Allow camera and microphone access when prompted, and use the in-call controls to manage them.

| Meeting control | Expected behavior |
| Join video consultation | Requests authorized entry and prepares the private video room. |
| Cancel joining | Stops an attempt that has not completed. |
| Try joining again | Retries after an error. |
| Leave call | Leaves the current call and releases the local call connection. |
| Rejoin video consultation | Attempts to enter again while the session remains available. |
| Review consultation request | Returns the administrator to the schedule-review area for a pending request. |
| Save meeting details | Saves an allowed schedule or duration change for an existing scheduled consultation. |
| Mark consultation in progress | Changes the stored consultation status to active. |
| Complete consultation | Marks the active consultation completed. |
| Cancel consultation | Cancels an eligible consultation through the clinic controls. |

Leaving the call and completing the consultation are different actions. The former disconnects a participant; the latter updates the clinic record. Clinical staff need the appropriate assignment and verified credentials for protected actions. Administrators use additional sign-in verification for coordination. If the system requests it, use Account settings and then return to the consultation.

If a device is unavailable, check browser permissions, confirm that another application is not exclusively using it, and retry. If the provider connection fails, keep the request status accurate and coordinate with the clinic through Messages. A deployed interface and a local device preview do not by themselves demonstrate a completed two-person call.

## 18 Inventory and medicine management

Inventory opens Medicine Management. Search medicines filters the catalogue, and Availability narrows the displayed entries. Add medicine opens a new form; Edit medicine opens an existing entry. Each card provides the information currently stored for that medicine.

| Field group | Information maintained |
| Identification | Medicine photo, medicine name, dosage, and purpose. |
| Patient guidance | Overview, usage instructions, step-by-step usage, precautions, and possible side effects. |
| Stock and purchasing | Quantity, unit, reorder level, availability, supplier, and unit cost. |
| Internal controls | Internal notes and the requirement for clinician prescription or approval before release. |

Create medicine saves a new entry, while Update medicine saves an existing one. Cancel or Close exits without submitting the form. Confirm numeric stock and pricing information before saving. Patient-facing instructions should be reviewed by qualified clinic personnel.

The Pharmacy pickup requests panel lists patient, selected medicines, quantities, notes, and status. Review request requires an explicit confirmation that the order and any necessary prescription were reviewed. A ready request can be marked Record handover when medicines are actually released. This deducts available, unexpired stock once. Insufficient stock rejects the complete handover without partially deducting items. Cancel request closes an eligible request. Patients can cancel their own pending requests and track clinic notes.

The patient Pharmacy page uses these entries for browsing and pickup requests. Adding an item to a patient's cart is not an inventory release, payment, prescription, or dispensing authorization. A prescription-required indicator must not be treated as an automatic approval merely because the item can be viewed.

## 19 Billing and PhilHealth preparation

Billing & Payments is available to the roles permitted by the application, including administrators and doctors. The page provides Payment records and PhilHealth preparation tabs. Payment records displays patient, service, total, cumulative amount paid, remaining balance, status, and available actions. Create bill opens the service, amount, discount, reference, and notes form. Record payment records money actually received, its payment method, transaction reference, and notes. Repeated submissions with the same reference do not double-charge the bill; an amount above the balance is rejected. View statement opens payment history, Download statement saves a text statement, and Export billing downloads CSV. Reconcile records an evidence-based historical paid amount for legacy partial bills whose payment details were not previously retained. These entries represent clinic records; no online payment gateway is connected through this screen.

| PhilHealth control | Operation and result |
| Find a patient and Search patients | Enter at least two characters and retrieve matching patient records. |
| Select patient | Load that patient's saved member information and documents. |
| Care package for document review | Change the preparation checklist used for the review. |
| Reveal or hide member information control | Show or conceal the saved identifier where offered. |
| Patient or record links | Open the related clinic record for authorized follow-up. |
| Reference links | Open the linked external reference material. |
| Try again | Retry a failed search or record request. |

The visible status is Not connected to PhilHealth. The workspace assists with member and document preparation; it does not perform live eligibility checks, transmit claims, obtain claim decisions, or confirm reimbursement. Recorded amounts and references are not evidence of an approved claim. External enrollment, authorized service access, and separate integration work remain necessary before such services can be described as live.

## 20 Health education reports and analytics

Health Education includes Search articles, Write article, Read full article, Collapse article, and Edit. Authorized staff enter title, category, care stage, article content, optional HTTPS resource link, and Publish for patients. Save record stores the article. Drafts remain hidden from patients; published articles appear in Health Tips. Dashboard Upload Media remains a separate media workflow.

Reports / Analytics summarizes completed births for the last twelve months. The stacked chart and monthly table distinguish NSD, CS, Forceps, and Vacuum; labor admissions are excluded until birth is recorded. Export summary downloads the displayed monthly values as CSV. The control is disabled when there is no available report to export. Clinical staff can read reports according to their role, while the separate Compliance export applies to audit records.

Charts summarize recorded information. They do not independently establish clinical outcomes or prove that every clinic event has been entered.

## 21 User management and credential review

User Management and Staff Credentials open the same account-management workspace, with grouping appropriate to its use. Administrators can search by name, email, or phone, filter roles and access status, inspect account activity indicators, review credentials, and change active status. Create staff account accepts first name, last name, email, contact number, role, and an initial password meeting the policy. Newly created clinical staff must submit their current professional credential in Account settings for clinic review before clinical access. Administrators cannot deactivate their own signed-in administrator account through Users. A green or active account state does not by itself mean the professional credential is approved.

| Administrator control | Use and result |
| Group and Role filters | Focus the list on patients, healthcare professionals, or other displayed groups. |
| Search people | Find an account using the supported identity or contact text. |
| Access status | Show active, inactive, or all matching accounts. |
| Review credentials | Open the selected account's identity or professional-license review panel. |
| Close credential review | Close that panel. |
| Deactivate | Pause account access when authorized. |
| Reactivate | Restore eligible account access when authorized. |

Patients submit one government-issued ID. Doctors, nurses, and midwives submit a current professional ID, license number, and expiry date. Administrators are not labeled licensed professionals merely because they manage the clinic account. The current User Management screen does not expose a general Create staff account or role-editing form; staffing setup requires the clinic's authorized account-provisioning process.

Within the credential panel, Refresh credentials reloads the submission. Download ID for review obtains the private file through authorized access. Run automated check or Rescan ID checks readability and consistency with submitted account details. These checks do not prove authenticity. Open official National ID Check and Check PRC registration open the linked external verification services; they do not automatically return an approval to MWOS.

The reviewer records a Review note and How was the ID confirmed, confirms the identity-check statement, and resolves scan concerns where required. Verify credential records approval when prerequisites are satisfied. Request replacement records a rejection or replacement requirement. The account holder can use Submit replacement, choose the correct file, consent to private review, and select Submit for review. Statuses include Not submitted, Awaiting review, Verified by clinic, Replacement needed, and Expired.

## 22 Compliance and activity review

Compliance provides an administrator view of recorded audit activity. Summary panels show action and authentication information. Filters narrow the audit dataset rather than changing the source records. The page supports a review of who performed recorded actions and the associated authentication context.

| Control | Operation |
| Window | Select the reporting interval. |
| Search | Filter the supported text in the audit list. |
| Action and Entity | Narrow the kind of operation and affected record type. |
| Auth method and Strength | Filter the recorded authentication category and level. |
| View details | Expand an individual audit entry. |
| Previous and Next | Move through result pages. |
| Export current page | Export the currently displayed audit page, not the full unrestricted history. |
| License review or Open staff registry | Open User Management for account and credential review. |
| Open my security profile | Open the administrator's account page. |

Audit entries support investigation and accountability. The screen is not a certification of regulatory compliance, and an empty result can reflect filters, permissions, or lack of recorded events. Exports should be handled as clinic information and shared only with authorized recipients.

## 23 Patient dashboard and care records

The patient Dashboard summarizes the patient's next visit, saved care information, follow-ups, messages, notifications, requirements, education, and featured providers. General clinic patients and maternal patients can see different labels. My Pregnancy and Baby / Newborn are conditional on maternal care, while general patients may see Clinic Readings.

| Patient section or shortcut | Action and result |
| Review appointment or Request an appointment | Opens the patient's appointment page. |
| Review care records or Review requirements | Opens Health Records and clinic document requirements. |
| Message the clinic or Open Care Team | Opens patient Messages. |
| Update contact details | Opens patient Settings. |
| Doctors or Open doctors | Opens the Care team directory. |
| Pharmacy Request | Opens the medicine catalogue and pickup-request flow. |
| Notifications or View all | Opens the patient's notification list. |
| Reports | Opens recorded care summaries and links to detailed views. |
| Emergency or View urgent contact options | Opens patient emergency contact and transport actions. |
| Manage My Documents | Opens Profile for permitted medical-document uploads. |

My Pregnancy or Clinic Readings displays recorded visit history and measurements. Try again retries a failed load. Patients review readings rather than overwrite clinic measurements. Baby / Newborn opens newborn records and their dated pediatric follow-up history. Patients have read-only access. Reports contains blood-pressure history, care summaries, guidance highlights, and links to My appointments, My vitals, My records, and Health tips.

Health Records contains Patient Requirements, Lab Results, and Prescriptions. For a requirement, select an already uploaded medical document and choose Submit for review. View submitted document opens the linked file. Upload medical files through Profile first when no suitable document is available. Requirement statuses and clinic review notes indicate whether additional action is needed. This submission process is separate from government-ID verification in Settings.

## 24 Patient appointments care team and pharmacy

Patients open Appointments, choose Visit category and Appointment type, provide a Preferred date and Preferred time, optionally select a provider, and add a Reason for visit. Send appointment request saves the request. The confirmation panel acknowledges receipt; it is not proof that the preferred provider and time have been approved. Request another visit clears the schedule and notes for another request. Appointment history displays the resulting statuses.

In Care team, Search care team narrows the provider list and View opens a profile. Book consultation opens Appointments. Start tele-consult submits a consultation request, and Open consultation leads to the dedicated Telehealth page. A legacy Open tele-consult link may appear when a returned meeting URL exists; use the dedicated Telehealth page for the in-system video experience. Back to doctors returns to the directory.

| Pharmacy control | How it works |
| Search medicines | Filters the available medicine catalogue. |
| View details | Opens the medicine description, usage, precautions, side effects, and pickup notes. |
| Add to cart | Adds the selected item to the pickup-request cart. |
| Checkout or Go to checkout | Opens the request review page. |
| Plus and minus | Adjust the requested quantity within the permitted range. |
| Remove | Removes that item from the cart. |
| Pickup notes | Adds coordination information for clinic review. |
| Send pickup request | Sends the request; it does not process online payment or approve medicine release. |
| Back to pharmacy | Returns to the catalogue. |
| Open notifications | Opens clinic updates after a request. |

My pharmacy requests shows each saved request as requested, ready, dispensed, or cancelled, including clinic notes. The clinic reviews stock, release requirements, and pickup arrangements before handover. Notifications may contain Review appointment or Review security settings links. Mark read changes the read state of the selected notification; it does not approve an appointment or resolve a security issue.

## 25 Emergency contact location and transport

The patient Emergency page offers contact actions, map-service choices, device-location sharing, and a transport-request form. Call now opens the device's telephone action for the configured contact. Open messages opens the patient conversation workspace. Neither selecting a map service nor submitting an online request guarantees immediate assistance.

| Control | User action and result |
| Share live location | Gives browser permission and starts sharing current device location with authorized emergency staff. |
| Stop sharing | Stops an active location share. |
| Map-service card | Selects the service information and its available map link. |
| External map action | Opens directions or the chosen map service outside MWOS. |
| Use saved address | Copies the stored address into the pickup information. |
| Use live location | Uses the currently available location for the request where offered. |
| Send urgent transport request | Submits the entered request type, callback number, pickup location, landmark, concern, destination, and companion notes. |
| Check request status | Refreshes the recorded request state. |
| Check Messages | Opens the related communication area for follow-up. |

On the clinic side, Emergency Map lists active, consent-based location shares. Select a patient card to inspect its displayed location and timestamp. Refresh now reloads the list. Open directions opens an external map. Location precision depends on the device and may be approximate or stale.

Referral & handover records shows the receiving facility, reason, and recorded progress. Staff use Record referral, then Update status through accepted, in_transit, handed_over, and closed, or cancel an eligible record. Each transition requires a confirmation or handover note. Download handover exports the record and timeline; patient views are limited to their own records. Saving a referral does not automatically contact a hospital.

The online request is not a dispatch confirmation. MWOS is not an emergency-response guarantee. Use the clinic's appropriate urgent contact process directly when time-critical assistance is needed; do not wait for an unread online message to be answered.

## 26 Profile account settings and security

Profile and Account settings serve different purposes. Profile shows personal, care, and document information. Settings contains account security, private identity credentials, preferences, and access management. Patients use their own profile; staff use the staff account page. Some clinical or identifying fields may be read-only to the patient.

| Profile control | Operation and result |
| Upload photo or Remove photo | Changes or removes the profile image. |
| Save profile | Saves permitted name and profile changes. |
| Personal information fields | Maintain the patient's allowed demographic and address information. |
| Allergies, existing conditions, and current medications | Provide self-reported history for staff review, rather than a new diagnosis or prescription. |
| Document type and Choose file | Select a medical document for upload. Government IDs belong in private credentials. |
| Upload | Sends the selected medical file. Wait for success before treating it as available. |
| Open beside a document | Opens an available uploaded file. |
| Manage patient credentials or Submit private ID | Opens the identity-verification section in Settings. |
| Emergency contact fields | Maintain the name, phone, and relationship of a contact person. |
| Save patient record | Saves permitted patient-profile changes. |

Account & security includes sign-in email, contact number, password controls, credential submission, and protected-action verification. Save login email saves an allowed email change and may require the current MWOS password. Save contact number stores a contact number; a saved number is not proof of SMS ownership verification. Recover or set MWOS password opens the recovery flow for an eligible account. The Email and Google sign-in security panel reports whether email delivery and an additional Google email-code check are configured. In-app notifications and delivered email are different channels; do not assume an email was sent from an in-app notice alone.

To change a password, enter Current password, New password, and Confirm new password, satisfy the checklist, then select Change password. For additional verification, select the appropriate Purpose under Step-up access, choose Send OTP, enter the delivered code, and select Verify OTP. Register passkey starts the supported device registration process. Clear step-up removes the additional verification state. These actions depend on configured verification delivery and device support.

| Settings section | Clickable options and effect |
| Account & security | Account details, credentials, password changes, step-up access, and account management. |
| Language | English or Filipino changes the supported settings labels and saves the choice on this browser. It is not a guarantee of full-system translation. |
| Privacy checkup | Reviews sign-in, contact, Google email-code, and device-permission information; Review account controls returns to the account controls. |
| Privacy Center | Explains information use and links to Review my information and, for patients, Contact clinic securely. |
| Activity log | Shows recent recorded activity and supported Google sign-in review actions; Retry reloads a failed list. |
| Content preferences | Toggles optional clinic videos/events and health-tip previews on the patient dashboard for this browser. |
| Appearance | Choose among the displayed visual options and select Save appearance. |

Manage account access provides Deactivate account and Request account deletion. Follow the identity-verification flow and read the confirmation text before proceeding. Keep my account active or Cancel abandons that operation. A deletion request is subject to clinic review and does not promise immediate erasure of clinical records. Reactivate a deactivated account opens the recovery procedure. Google account security and Google recovery links open Google outside MWOS.

## 27 Complete operating procedures

### Patient first use

1. Open the MWOS website and create a patient account or use an existing sign-in method.
2. Review Profile and correct permitted personal and contact information.
3. Open Settings and submit one government-issued ID for private clinic review.
4. Open Appointments to request a physical visit, or Telehealth to request a virtual consultation.
5. Read the saved request status and wait for clinic confirmation.
6. Check Messages and Notifications for coordination and preparation information.
7. After the visit, review Health Records and recorded readings. Sign out on a shared device.

### Clinic daily workflow

1. Sign in using the assigned clinic account and complete additional verification when required.
2. Review Dashboard and Appointments to identify the day's work.
3. Use Patients to locate the correct record before documenting a visit.
4. Record observations in Prenatal Monitoring, Examinations, Immunizations, or Deliveries as applicable.
5. Review and accept telehealth requests only after checking the selected time and duration.
6. Coordinate through Messages and keep appointment and consultation statuses accurate.
7. Review pending credentials and medical documents through their separate workflows.
8. Use Reports or Compliance for the available summaries, and sign out when finished.

### Telehealth demonstration

1. Use separately authorized patient and provider or coordinator accounts on two devices or browser sessions.
2. Submit a patient request with a preferred future date and time.
3. On the admin account, review the request, Check availability, and Accept consultation.
4. Open the accepted consultation from each participant's account.
5. Test local devices, select Join video consultation, and grant the needed permissions.
6. Confirm that both participants can hear and see each other before describing the demonstration as a successful live connection.
7. Leave the call, update the consultation outcome using the authorized clinic controls, and inspect the saved status.

### Filipino quick guide

Para sa patient: mag-sign in, kumpletuhin ang Profile, isumite ang isang valid ID sa Settings, at pumili ng Appointments o Telehealth. Ang Submit request ay pagpapadala pa lamang; hintayin ang confirmed schedule. Buksan ang Messages at Notifications para sa sagot ng klinika.

Para sa admin: piliin ang tamang patient, suriin ang request, at i-check ang schedule bago mag-accept. Sa Telehealth, piliin ang Check availability bago ang Accept consultation. Kung wala pang verified clinical provider, gamitin ang Admin · Clinic coordinator para sa coordination. Ang clinical assessment ay para sa licensed professional.

Para sa staff: tiyaking verified ang professional credential at may kinakailangang additional verification bago gumawa ng protected clinical action. Basahin muna ang pangalan ng patient bago mag-save. Kapag may error, basahin ang mensahe at ayusin ang dahilan; huwag ituring na saved ang entry hangga't walang confirmation.

## 28 Common problems and recovery

| Situation | What it means | Recommended action |
| Invalid email or password | The supplied sign-in details were not accepted. | Check the email and exact password, then use Forgot password if necessary. Do not include a descriptive prefix such as password or pass in the password field. |
| Provider list is empty | No eligible provider or coordinator was returned, or the directory failed to load. | Use the displayed retry action and ask the clinic to check active accounts and credential status. |
| Additional verification required | The requested action needs a stronger current sign-in check. | Open Account settings, complete the relevant verification, then retry the action. |
| Credential pending or replacement needed | The document has not been approved or needs correction. | Read the clinic note and submit the appropriate replacement through private credentials. |
| No records or no matching results | The selection has no available data, or the search excludes it. | Confirm the patient, search text, filters, and account permissions. |
| Appointment or consultation conflict | The requested time overlaps a relevant booking. | Choose another time or duration and run the availability check again. |
| Camera or microphone unavailable | Device permission, hardware access, or another application may interfere. | Review browser site permissions, stop conflicting device use, and retry the device check. |
| Video admission failed | The session, participant authorization, provider service, or connection could not be accepted. | Confirm the correct scheduled consultation and use Try joining again or Messages for coordination. |
| Upload failed | The file or transfer was not accepted. | Read the error, verify the chosen file, and retry without assuming it is stored. |
| Old interface remains visible | The browser may still display a previously loaded app version. | Reload the page; on a desktop browser, use Ctrl + F5 when necessary. |
| Export summary is disabled | No report data is available, or loading failed. | Load a reporting period with completed births; retry any reported connection error. |
| Transport request is waiting | Receipt of a request does not equal a dispatched vehicle. | Follow the clinic's urgent contact process and check the recorded request status. |

## 29 Current functional boundaries

The following distinctions should remain explicit in a manuscript, demonstration, or evaluation. They prevent a visible label or planned integration from being described as a completed operational service.

| Area | Current documented behavior | Claim to avoid |
| PhilHealth | Member, document, and billing-reference preparation. | Live eligibility verification, eClaims transmission, approved benefits, or reimbursement. |
| Online payments | Stored billing information and pickup-request coordination. | A connected payment gateway or completed online charge. |
| ID scanning | Readability and consistency checks with clinic review. | Guaranteed fake-ID detection or automatic proof of identity. |
| Professional verification | Reviewed credential information and links to external checking services. | Automatic government-registry certification based solely on a file upload. |
| Admin telehealth fallback | Administrative coordination when eligible clinical professionals are unavailable. | Assigning the admin a medical license or clinical qualification. |
| Telehealth | Embedded calling interface, private admission flow, and scheduling controls. | A completed live call without observing both participants connect. |
| Reports export | Monthly delivery CSV download. | A full unrestricted database export. |
| Pregnancies tab | History with create and update forms. | Automatically confirmed clinical findings. |
| Postnatal Monitoring | Delivery-linked postpartum visits and history. | Automated diagnosis or live bed occupancy. |
| Baby / Newborn and Pediatric Monitoring | Newborn registration and dated pediatric visits. | A validated growth-percentile or newborn screening service. |
| Health Education | Article editor, publication control, and full-article reading. | Automatic clinical approval of article content. |
| Staff account setup | Admin staff creation, credential review, and access status controls. | Automatic professional licensure. |
| Facility tour | Photographs for orientation. | Live occupancy, room reservation, or equipment-status monitoring. |
| Emergency support | Contact links, location sharing, and transport requests. | Guaranteed dispatch or immediate response. |
| Platform cards | Browser access and supported web-app installation. | Published signed native installers for all four operating systems. |
| Activity and backup panels | Audit records, clinical export, and configured local full backups; isolated restore tested. | A live production restore test or guaranteed provider retention policy. |

## 30 Manuscript description of system operation

### Overall operational description

The Maternal Wellness and Operations System provides a role-based workspace for patient communication and selected clinic operations at TMC Copino Birthing Home and Medical Clinic. The public website introduces available care categories, clinic facilities, contact information, and portal-access options. After authentication, users are directed to a workspace corresponding to their role. The patient portal emphasizes appointment requests, consultation requests, personal records, notifications, and communication, while the clinic workspace groups patient intake, observations, scheduling, medical records, inventory, billing references, and administrative review.

### Input processing and output

User interaction follows an input, validation, processing, and feedback sequence. Users enter information through forms, select records through lists and filters, and initiate actions through labeled buttons. The system validates the request and applies the relevant access checks before saving or retrieving data. Accepted operations update the associated record and provide a status message, list entry, or refreshed history. Invalid requests display errors that the user must resolve. This interaction pattern maintains a distinction between entering information and obtaining a confirmed clinical or administrative outcome.

### Role based coordination

Patient accounts are created through public registration, while clinic access is assigned through an authorized process. Patient identity documents and professional credentials use separate review requirements. Administrative users can review account status and credential submissions without being represented as licensed clinical providers. In Telehealth, an active administrator may temporarily coordinate requests when no eligible verified professional is available. Clinical responsibility remains distinct from administrative coordination.

### Appointment and consultation management

The system allows patients to request an in-person appointment or a virtual consultation. A requested schedule is subject to clinic confirmation. For telehealth review, the administrator chooses a date, time, and duration, checks availability, and accepts a suitable request. The resulting consultation can be opened by authorized participants through an embedded video interface. Device preparation, call admission, participation, and the stored consultation status are separate stages of the workflow.

### Records and operational support

Clinical pages organize recorded observations, laboratory results, ultrasound findings, immunizations, and delivery information around the selected patient. Patients review their own saved information through the portal and use messages to coordinate with the clinic. Operational pages support medicine-catalogue maintenance, recorded billing information, audit review, and available summary reports. The PhilHealth workspace assists with preparation, while live claims integration and online payment processing remain outside the connected functions of the documented version.

### Evaluation boundary

A system evaluation should assess each implemented action using an observable input and result. A form submission, updated database record, displayed status, downloaded file, and completed two-participant video call represent different outcomes and should be tested separately. The November workflow release was checked with 80 isolated database/API assertions, additional signing and rollback checks, full backup and isolated restore, and browser-driven record saves. Production provider integrations and two-participant live-call quality require separate evidence. This distinction supports an accurate account of the system's implemented capabilities and remaining development work.

## 31 Interface locations and screenshot captions

The links below identify the main interface locations. Protected links require the appropriate account. A screenshot used in a manuscript should show the relevant controls with demonstration data and should exclude passwords, verification codes, government-ID images, private identifiers, and identifiable patient records.

| Interface | Location | Suggested figure caption |
| Public website | / | Public clinic information and portal entry page |
| Sign in | /login | Authentication options for authorized MWOS users |
| Patient registration | /register | Patient account registration steps |
| Download Center | /download | Platform setup and web portal access |
| Clinic Dashboard | /dashboard | Clinic overview and coordination workspace |
| Patients and patient detail | /patients | Patient search and record navigation |
| Appointments | /appointments | Clinic calendar and appointment scheduling controls |
| Prenatal Monitoring | /prenatal-monitoring | Patient selection and recorded maternal observations |
| Postnatal Monitoring | /postnatal-monitoring | Delivery-linked postpartum visits and history. |
| Labor & Delivery | /labor-delivery | Delivery-entry form and patient reference |
| Pediatric Monitoring | /pediatric-monitoring | Newborn registration and pediatric follow-up |
| Medical Records | /medical-records | Laboratory and ultrasound record management |
| Telehealth | /telehealth | Consultation review and embedded video controls |
| Messages | /messages | Authorized conversation and reply workspace |
| Emergency Map | /emergency-map | Active patient location shares for coordination |
| Inventory | /inventory | Medicine catalogue and maintenance form |
| Billing | /billing | Bills, cumulative payments, statements, and PhilHealth preparation |
| Health Education | /education | Article editor, publication control, and full-article reading. |
| Reports | /reports-analytics | Available clinic summaries and monthly trends |
| User Management | /users | Account grouping and credential-review access |
| Staff Credentials | /staff-qualifications | Professional credential review workspace |
| Compliance | /compliance | Audit filters and recorded activity review |
| Patient Dashboard | /my/dashboard | Patient overview and care shortcuts |
| Patient appointments | /my/appointments | Patient appointment request and history |
| Patient readings | /my/pregnancy or /my/vitals | Recorded observations available to the patient |
| Health Records | /my/health-records | Patient requirements laboratory results and prescriptions |
| Baby and care reports | /my/baby or /my/reports | Patient care summaries and detailed-view links |
| Patient Telehealth | /my/telehealth | Patient consultation request and video entry |
| Patient Messages | /my/messages | Patient communication with the clinic |
| Notifications | /my/notifications | Clinic updates and read-state controls |
| Care team | /my/doctors | Provider directory and profile access |
| Pharmacy and checkout | /my/pharmacy | Medicine browsing and pickup-request preparation |
| Patient emergency support | /my/emergency | Contact location-sharing and transport-request controls |
| Patient Health Tips | /my/health-tips | Patient educational content |
| Profile | /account or /my/profile | User profile and permitted personal information |
| Settings | /settings or /my/settings | Account security credentials and display preferences |

Related routes include /portal for role-aware entry, /forgot-password and /reset-password for recovery, /reactivate-account for eligible reactivation, and /interactions for the supplementary staff Care Hub. Older links such as /vitals, /deliveries, /examinations, /immunizations, /medicines, /education, /reports, /my/records, and /my/education point to the corresponding current workspaces. /my/interactions opens patient Messages. Provider, medicine, and patient-detail links use the selected record identifier; they should be opened from the directory or list rather than guessed.

## 32 Documentation source register

This manual describes the interface and workflows of the documented MWOS application version. The sources below support the screen names, control labels, routing, and stated implementation boundaries. They are project sources rather than independent clinical or regulatory references.

| Source group | Application files and covered areas |
| Navigation and entry | frontend/src/App.jsx; components/common/AppLayout.jsx; pages/LandingPage.jsx; pages/DownloadPage.jsx; components/common/PlatformSetup.jsx. |
| Authentication | pages/LoginPage.jsx; RegisterPage.jsx; ForgotPasswordPage.jsx; ResetPasswordPage.jsx; ReactivateAccountPage.jsx; utils/passwordPolicy.js. |
| Clinic workspaces | pages/DashboardPage.jsx; PatientsPage.jsx; PatientDetailPage.jsx; AppointmentsPage.jsx; VitalsPage.jsx; ExaminationsPage.jsx; ImmunizationsPage.jsx; ClinicalWorkflows.jsx. |
| Communication | pages/MessagesPage.jsx; InteractionsPage.jsx; TelehealthPage.jsx; components/telehealth/ConsultationReview.jsx; ConsultationVideo.jsx; EmbeddedCall.jsx; DeviceCheck.jsx. |
| Provider selection | backend/src/utils/teleconsultProviders.js; backend/src/controllers/interaction.controller.js; frontend/src/utils/telehealthProviders.js. |
| Operations and administration | pages/InventoryPage.jsx; BillingPage.jsx; ClinicalWorkflows.jsx; CompliancePage.jsx; UsersPage.jsx; components/common/CoordinationWorkflows.jsx; BackupControls.jsx; components/billing/PhilHealthPreparation.jsx; components/credentials/AccountCredentials.jsx. |
| Patient portal | pages/patient/PatientDashboardPage.jsx; PatientAppointmentsPage.jsx; PatientVitalsPage.jsx; PatientReportsPage.jsx; PatientDoctorsPage.jsx; PatientDoctorDetailPage.jsx; PatientPharmacyPage.jsx; PatientMedicineDetailPage.jsx; PatientCheckoutPage.jsx; PatientCheckoutSuccessPage.jsx; PatientNotificationsPage.jsx; PatientEmergencyPage.jsx; _patientPages.jsx. |
| Account and supporting controls | pages/AccountCenterPage.jsx; components/common/SettingsPanel.jsx; AccountSecurityActions.jsx; ContactNumberCard.jsx; EmailNotificationSettings.jsx; store/settingsStore.js; utils/clinicFacilities.js. |

The documented online entry points are the MWOS website and Login page. Review dates, screenshots, usability results, and acceptance-test evidence should be recorded separately when the manuscript reports actual evaluation outcomes. This manual explains operation; it does not substitute for observed testing results or claim that every external service has been activated.
