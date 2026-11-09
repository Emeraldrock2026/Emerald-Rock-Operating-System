import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { selectableClients, validateProjectDates } from "@/lib/domain/projects";

const NONE = "__none__";

export interface ProjectFormValues {
  name: string;
  client_id: string | null;
  project_manager_id: string | null;
  start_date: string;
  planned_finish_date: string;
  scope: string;
}

export function ProjectForm({ id, initial, clients, managers, onSubmit }: {
  id: string;
  initial: ProjectFormValues;
  clients: { id: string; name: string; active: boolean }[];
  managers: { id: string; full_name: string; active: boolean }[];
  onSubmit: (v: ProjectFormValues) => void;
}) {
  const [clientId, setClientId] = useState(initial.client_id ?? NONE);
  const [pmId, setPmId] = useState(initial.project_manager_id ?? NONE);
  const submit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const t = (k: string) => String(f.get(k) ?? "").trim();
    const v: ProjectFormValues = {
      name: t("name"), scope: t("scope"), start_date: t("start_date"), planned_finish_date: t("planned_finish_date"),
      client_id: clientId === NONE ? null : clientId, project_manager_id: pmId === NONE ? null : pmId,
    };
    if (validateProjectDates(v.start_date, v.planned_finish_date)) { toast.error("The planned finish date can't be before the start date."); return; }
    onSubmit(v);
  };
  const pms = managers.filter((m) => m.active || m.id === initial.project_manager_id);
  return (
    <form id={id} onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-name`}>Project name</Label>
        <Input id={`${id}-name`} name="name" required maxLength={200} defaultValue={initial.name} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-client`}>Client</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger id={`${id}-client`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No client (internal)</SelectItem>
              {selectableClients(clients, initial.client_id).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.active ? "" : " (inactive)"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-pm`}>Project manager</Label>
          <Select value={pmId} onValueChange={setPmId}>
            <SelectTrigger id={`${id}-pm`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Not set</SelectItem>
              {pms.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-start`}>Start date</Label>
          <Input id={`${id}-start`} name="start_date" type="date" required defaultValue={initial.start_date} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-finish`}>Planned finish date</Label>
          <Input id={`${id}-finish`} name="planned_finish_date" type="date" required defaultValue={initial.planned_finish_date} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-scope`}>Scope</Label>
        <Textarea id={`${id}-scope`} name="scope" maxLength={2000} rows={4} defaultValue={initial.scope} />
      </div>
    </form>
  );
}

export function SubmitButton({ form, pending, label }: { form: string; pending: boolean; label: string }) {
  return <Button type="submit" form={form} disabled={pending}>{pending ? "Saving…" : label}</Button>;
}
