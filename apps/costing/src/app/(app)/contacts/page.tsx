"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, PageHeader, RequireOrg, Workspace } from "@/components/PageShell";
import { Modal } from "@/components/Modal";
import { TextInput } from "@/components/fields";
import { useSession } from "@/components/SessionProvider";
import {
  CONTACT_TYPES,
  CONTACT_TYPE_LABEL,
  contactLabel,
  deleteContact,
  listContacts,
  saveContact,
  type ContactInput,
  type ContactRecord,
  type ContactType,
} from "@/features/contacts/repository";

function blank(type: ContactType): ContactInput {
  return {
    contactType: type,
    companyName: "",
    personName: "",
    email: "",
    phone: "",
    jobTitle: "",
    address: "",
    notes: "",
    isDefault: false,
  };
}

export default function ContactsPage() {
  return (
    <Workspace>
      <RequireOrg>
        <ContactsView />
      </RequireOrg>
    </Workspace>
  );
}

function ContactsView() {
  const session = useSession();
  const canManage = session.can("quotes.create");
  const [contacts, setContacts] = useState<ContactRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ContactType | "all">("all");
  const [editing, setEditing] = useState<ContactInput | null>(null);

  const load = useCallback(async () => {
    try {
      setContacts(await listContacts());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load contacts.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => (contacts ?? []).filter((contact) => filter === "all" || contact.contactType === filter),
    [contacts, filter],
  );

  function openEdit(contact: ContactRecord) {
    setEditing({
      id: contact.id,
      contactType: contact.contactType,
      companyName: contact.companyName ?? "",
      personName: contact.personName ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      jobTitle: contact.jobTitle ?? "",
      address: contact.address ?? "",
      notes: contact.notes ?? "",
      isDefault: contact.isDefault,
    });
  }

  async function remove(contact: ContactRecord) {
    if (!window.confirm(`Delete ${contactLabel(contact)}?`)) return;
    try {
      await deleteContact(contact.id);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this contact.");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="CONTACTS"
        title="Contacts"
        subtitle="Suppliers, customers and your representatives — used on offer sheets."
        actions={canManage ? <button onClick={() => setEditing(blank("customer"))}>＋ New contact</button> : undefined}
      />
      <div className="page">
        {error && <EmptyState icon="⚠️" title="Something went wrong">{error}</EmptyState>}
        <div className="toolbar">
          <div className="chips">
            <button className={filter === "all" ? "chip active" : "chip"} onClick={() => setFilter("all")}>All</button>
            {CONTACT_TYPES.map((type) => (
              <button key={type} className={filter === type ? "chip active" : "chip"} onClick={() => setFilter(type)}>
                {CONTACT_TYPE_LABEL[type]}
              </button>
            ))}
          </div>
        </div>

        {!contacts ? (
          <EmptyState icon="⏳" title="Loading contacts…" />
        ) : (
          <div className="card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Contact</th>
                  <th>Phone</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td className="row-empty" colSpan={5}>No contacts in this view.</td>
                  </tr>
                ) : (
                  visible.map((contact) => (
                    <tr key={contact.id} onClick={() => (canManage ? openEdit(contact) : undefined)}>
                      <td className="strong">
                        {contactLabel(contact)}
                        {contact.isDefault && contact.contactType === "representative" ? (
                          <span className="status status--ready_for_export" style={{ marginLeft: 8 }}>Default</span>
                        ) : null}
                        {contact.personName && contact.companyName ? (
                          <div className="muted" style={{ fontSize: 11 }}>{contact.personName}</div>
                        ) : null}
                      </td>
                      <td>{CONTACT_TYPE_LABEL[contact.contactType]}</td>
                      <td>{contact.email ?? "—"}</td>
                      <td>{contact.phone ?? "—"}</td>
                      <td className="num" onClick={(event) => event.stopPropagation()}>
                        {canManage && (
                          <button className="button-sm button-danger" onClick={() => remove(contact)}>Delete</button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ContactForm
          value={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </>
  );
}

function ContactForm({ value, onClose, onSaved }: { value: ContactInput; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<ContactInput>(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: "companyName" | "personName" | "email" | "phone" | "jobTitle" | "address" | "notes", next: string) =>
    setForm((prev) => ({ ...prev, [key]: next }));

  async function submit() {
    if (!form.companyName.trim() && !form.personName.trim()) {
      setError("Enter a company or a person name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveContact(form);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this contact.");
      setSaving(false);
    }
  }

  return (
    <Modal title={form.id ? "Edit contact" : "New contact"} onClose={onClose}>
      <div className="form-grid" style={{ padding: 0, gridTemplateColumns: "1fr 1fr" }}>
        <label className="field">
          <span>Type</span>
          <span className="control">
            <select
              value={form.contactType}
              onChange={(event) => setForm((prev) => ({ ...prev, contactType: event.target.value as ContactType }))}
            >
              {CONTACT_TYPES.map((type) => (
                <option key={type} value={type}>{CONTACT_TYPE_LABEL[type]}</option>
              ))}
            </select>
          </span>
        </label>
        <TextInput label="Company" value={form.companyName} onChange={(v) => set("companyName", v)} />
        <TextInput label="Person" value={form.personName} onChange={(v) => set("personName", v)} />
        <TextInput label="Job title" value={form.jobTitle} onChange={(v) => set("jobTitle", v)} />
        <TextInput label="Email" type="email" value={form.email} onChange={(v) => set("email", v)} />
        <TextInput label="Phone" value={form.phone} onChange={(v) => set("phone", v)} />
      </div>
      <div style={{ marginTop: 16 }}>
        <TextInput label="Address" value={form.address} onChange={(v) => set("address", v)} />
      </div>
      <div style={{ marginTop: 16 }}>
        <TextInput label="Notes" value={form.notes} onChange={(v) => set("notes", v)} />
      </div>

      {form.contactType === "representative" && (
        <label className="field" style={{ flexDirection: "row", alignItems: "center", gap: 10, margin: "16px 0 4px" }}>
          <input
            type="checkbox"
            checked={form.isDefault}
            onChange={(event) => setForm((prev) => ({ ...prev, isDefault: event.target.checked }))}
            style={{ width: 18, height: 18 }}
          />
          <span>Default representative (pre-filled on new offer sheets)</span>
        </label>
      )}

      {error && <p className="auth-message" style={{ marginTop: 16 }}>{error}</p>}
      <div className="form-actions" style={{ marginTop: 20 }}>
        <button className="secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save contact"}</button>
      </div>
    </Modal>
  );
}
