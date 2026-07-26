"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState, PageHeader, RequireOrg, Workspace } from "@/components/PageShell";
import { useSession } from "@/components/SessionProvider";
import {
  assignRole,
  loadAdminSnapshot,
  loadMemberDirectory,
  removeRole,
  type AdminSnapshot,
  type Member,
  type MemberIdentity,
} from "@/features/admin/repository";
import { listSalespeople, setCommission, type SalespersonProfile } from "@/features/salespeople/repository";
import {
  createTeam,
  deleteTeam,
  listTeamMemberships,
  listTeams,
  removeTeamMembership,
  setTeamMembership,
  updateTeam,
  type TeamRecord,
} from "@/features/teams/repository";
import { useAccessPersona } from "@/components/AccessPersonaProvider";

export default function AdminPage() {
  return (
    <Workspace>
      <PageHeader
        eyebrow="ADMINISTRATION"
        title="Administration"
        subtitle="Manage organisation access and Costing roles."
      />
      <div className="page">
        <RequireOrg>
          <AdminView />
        </RequireOrg>
      </div>
    </Workspace>
  );
}

function AdminView() {
  const session = useSession();
  const canManage = session.can("iam.manage");
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [directory, setDirectory] = useState<Record<string, MemberIdentity>>({});
  const [commissions, setCommissions] = useState<Record<string, SalespersonProfile>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session.organizationId) return;
    try {
      const [snap, dir, comm] = await Promise.all([
        loadAdminSnapshot(session.organizationId),
        loadMemberDirectory(session.organizationId),
        listSalespeople(session.organizationId).catch(() => ({})),
      ]);
      setSnapshot(snap);
      setDirectory(dir);
      setCommissions(comm);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load administration data.");
    }
  }, [session.organizationId]);

  async function saveCommission(userId: string, rate: number) {
    if (!session.organizationId) return;
    try {
      await setCommission(session.organizationId, userId, rate);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update commission.");
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleRole(userId: string, roleId: string, active: boolean) {
    if (!session.organizationId) return;
    const key = `${userId}:${roleId}`;
    setBusyKey(key);
    setError(null);
    try {
      if (active) await removeRole(session.organizationId, userId, roleId);
      else await assignRole(session.organizationId, userId, roleId);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update roles.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="stack">
      <div className="panel">
        <h3 className="with-border">Organisation</h3>
        <div className="kv"><span>Name</span><b>{session.organizationName ?? "—"}</b></div>
        <div className="kv"><span>Signed in as</span><b>{session.userEmail ?? "—"}</b></div>
        <div className="kv">
          <span>Your permissions</span>
          <b>{session.permissions.length ? session.permissions.join(", ") : "None"}</b>
        </div>
      </div>

      {error && <EmptyState icon="⚠️" title="Something went wrong">{error}</EmptyState>}

      <div className="panel">
        <h3 className="with-border">Teams</h3>
        <TeamsPanel
          canManage={canManage}
          members={snapshot?.members ?? []}
          directory={directory}
          onChanged={load}
        />
      </div>

      <div className="panel">
        <h3 className="with-border">Members & roles</h3>
        {!canManage && (
          <p className="inline-note" style={{ marginBottom: 12 }}>
            You can view members, but only an administrator (with <code>iam.manage</code>) can change roles.
          </p>
        )}
        {!snapshot ? (
          <p className="muted" style={{ fontSize: 13 }}>Loading members…</p>
        ) : snapshot.members.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No members found.</p>
        ) : (
          <table className="data-table" style={{ marginTop: 4 }}>
            <thead>
              <tr>
                <th>Member</th>
                <th>Status</th>
                <th>Roles</th>
                <th className="num">Commission</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.members.map((member) => (
                <tr key={member.userId} style={{ cursor: "default" }}>
                  <td className="strong">
                    {directory[member.userId]?.displayName ??
                      directory[member.userId]?.email ??
                      (member.isSelf ? session.userEmail ?? "You" : "Team member")}
                    <div className="muted" style={{ fontSize: 11 }}>
                      {directory[member.userId]?.email ?? `${member.userId.slice(0, 8)}…`}
                    </div>
                  </td>
                  <td>
                    <span className={member.status === "active" ? "status status--ready_for_export" : "status status--draft"}>
                      {member.status}
                    </span>
                  </td>
                  <td>
                    <div className="chips">
                      {snapshot.roles.map((role) => {
                        const active = member.roleIds.includes(role.id);
                        const key = `${member.userId}:${role.id}`;
                        return (
                          <button
                            key={role.id}
                            className={active ? "chip active" : "chip"}
                            disabled={!canManage || busyKey === key}
                            title={canManage ? (active ? "Remove role" : "Assign role") : role.name}
                            onClick={() => canManage && toggleRole(member.userId, role.id, active)}
                          >
                            {role.name}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="num">
                    <CommissionCell
                      value={commissions[member.userId]?.commissionRate ?? 0}
                      canEdit={canManage}
                      onSave={(rate) => saveCommission(member.userId, rate)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="inline-note" style={{ marginTop: 14 }}>
          Names and emails are visible to administrators via a secure directory lookup. Members without a
          display name show their email; set display names in <code>iam.user_profiles</code>.
        </p>
      </div>

      <div className="panel">
        <h3 className="with-border">Invite a teammate</h3>
        <ol className="muted" style={{ fontSize: 13, lineHeight: 1.7, paddingLeft: 18, margin: 0 }}>
          <li>In the Supabase dashboard, open <b>Authentication → Users</b> and invite the person by email.</li>
          <li>Add them to this organisation in <b>iam.organization_memberships</b> with status <b>active</b>.</li>
          <li>They will then appear in the table above, where you can assign their Costing roles.</li>
        </ol>
      </div>
    </div>
  );
}

function CommissionCell({
  value,
  canEdit,
  onSave,
}: {
  value: number;
  canEdit: boolean;
  onSave: (rate: number) => void;
}) {
  const [draft, setDraft] = useState((value * 100).toString());
  useEffect(() => {
    setDraft((value * 100).toString());
  }, [value]);

  if (!canEdit) {
    return <span>{value > 0 ? `${(value * 100).toFixed(1)}%` : "—"}</span>;
  }

  return (
    <span className="control" style={{ minHeight: 34, maxWidth: 110, marginLeft: "auto" }}>
      <input
        type="number"
        min="0"
        step="0.1"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onSave((Number(draft) || 0) / 100)}
        style={{ height: 32, textAlign: "right" }}
      />
      <b>%</b>
    </span>
  );
}

function TeamsPanel({
  canManage,
  members,
  directory,
  onChanged,
}: {
  canManage: boolean;
  members: Member[];
  directory: Record<string, MemberIdentity>;
  onChanged: () => Promise<void>;
}) {
  const access = useAccessPersona();
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<Array<{ userId: string; isLeader: boolean }>>([]);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const rows = await listTeams();
    setTeams(rows);
    if (selectedId && !rows.some((team) => team.id === selectedId)) {
      setSelectedId(rows[0]?.id ?? null);
    } else if (!selectedId && rows[0]) {
      setSelectedId(rows[0].id);
    }
  }, [selectedId]);

  useEffect(() => {
    void reload().catch((cause) =>
      setError(cause instanceof Error ? cause.message : "Could not load teams."),
    );
  }, [reload]);

  useEffect(() => {
    if (!selectedId) {
      setMemberIds([]);
      return;
    }
    void listTeamMemberships(selectedId)
      .then(setMemberIds)
      .catch(() => setMemberIds([]));
    const team = teams.find((row) => row.id === selectedId);
    if (team) {
      setName(team.name);
      setLabel(team.salesRepLabel ?? "");
    }
  }, [selectedId, teams]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createTeam({ name, salesRepLabel: label });
      await reload();
      await access.refreshTeams();
      await onChanged();
      setSelectedId(created.id);
      setName("");
      setLabel("");
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : cause && typeof cause === "object" && "message" in cause
            ? String((cause as { message?: unknown }).message ?? "")
            : "";
      setError(message || "Could not create team.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSelected() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await updateTeam(selectedId, { name, salesRepLabel: label });
      await reload();
      await access.refreshTeams();
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update team.");
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (!selectedId || !window.confirm("Delete this team?")) return;
    setBusy(true);
    try {
      await deleteTeam(selectedId);
      setSelectedId(null);
      await reload();
      await access.refreshTeams();
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete team.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleMember(userId: string, active: boolean, asLeader = false) {
    if (!selectedId) return;
    setBusy(true);
    try {
      if (active) await removeTeamMembership(selectedId, userId);
      else await setTeamMembership(selectedId, userId, asLeader);
      const rows = await listTeamMemberships(selectedId);
      setMemberIds(rows);
      await reload();
      await access.refreshTeams();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update membership.");
    } finally {
      setBusy(false);
    }
  }

  const memberLabel = (userId: string) =>
    directory[userId]?.displayName ?? directory[userId]?.email ?? `${userId.slice(0, 8)}…`;

  return (
    <div>
      {!canManage && (
        <p className="inline-note" style={{ marginBottom: 12 }}>
          Only administrators can create teams and assign members.
        </p>
      )}
      {error && <p className="auth-message">{error}</p>}

      <div className="form-grid two" style={{ padding: 0, marginBottom: 16 }}>
        <label className="field">
          <span>New team name</span>
          <span className="control">
            <input value={name} disabled={!canManage || Boolean(selectedId)} onChange={(e) => setName(e.target.value)} placeholder="e.g. North" />
          </span>
        </label>
        <label className="field">
          <span>Sales-rep label</span>
          <span className="control">
            <input value={label} disabled={!canManage} onChange={(e) => setLabel(e.target.value)} placeholder="Shipping report name" />
          </span>
        </label>
      </div>
      {canManage && !selectedId && (
        <button className="button-sm" disabled={busy || !name.trim()} onClick={() => void create()}>
          Create team
        </button>
      )}

      {teams.length > 0 && (
        <>
          <label className="field" style={{ marginTop: 18 }}>
            <span>Selected team</span>
            <span className="control">
              <select
                value={selectedId ?? ""}
                onChange={(event) => {
                  setSelectedId(event.target.value || null);
                  const team = teams.find((row) => row.id === event.target.value);
                  setName(team?.name ?? "");
                  setLabel(team?.salesRepLabel ?? "");
                }}
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                    {team.salesRepLabel ? ` · ${team.salesRepLabel}` : ""}
                  </option>
                ))}
              </select>
            </span>
          </label>

          {selectedId && canManage && (
            <div className="action-bar" style={{ marginTop: 12 }}>
              <button className="button-sm" disabled={busy} onClick={() => void saveSelected()}>
                Save team
              </button>
              <button className="button-sm secondary" disabled={busy} onClick={() => void removeSelected()}>
                Delete
              </button>
              <button className="button-sm secondary" disabled={busy} onClick={() => setSelectedId(null)}>
                New team form
              </button>
            </div>
          )}

          {selectedId && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>Members</h4>
              <div className="chips">
                {members.map((member) => {
                  const active = memberIds.some((row) => row.userId === member.userId);
                  const leader = memberIds.some((row) => row.userId === member.userId && row.isLeader);
                  return (
                    <span key={member.userId} className="chip-stack">
                      <button
                        className={active ? "chip active" : "chip"}
                        disabled={!canManage || busy}
                        onClick={() => canManage && toggleMember(member.userId, active, false)}
                      >
                        {memberLabel(member.userId)}
                        {leader ? " · Leader" : ""}
                      </button>
                      {canManage && active && !leader && (
                        <button
                          className="chip"
                          disabled={busy}
                          onClick={() => void toggleMember(member.userId, false, true)}
                        >
                          Make leader
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
