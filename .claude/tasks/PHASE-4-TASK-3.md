# Task 4.3 — Contacts split-view list

Contacts index at `/app/contacts` shows a sidebar list + a detail pane.
Selecting a row updates both the URL (`/app/contacts/:id`) and the pane.
On narrow screens the list hides when a detail is selected.

A small AddContactModal lets users create a contact (first + last name
required, email/phone/position optional). Success navigates into the
newly-created contact.
