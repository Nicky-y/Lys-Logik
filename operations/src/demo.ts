import { randomId } from './random-id';
import {
  OperationsLeadSchema,
  LeadEventSchema,
  StaffSchema,
  CommandReceiptSchema,
  availableTransitions,
  type OperationsLead,
  type LeadEvent,
  AppointmentSchema,
  type Appointment,
} from '../../supabase/functions/_shared/contracts/operations.ts';
import { OperationsError, type OperationsGateway } from './gateway';
import { copenhagenLocal, copenhagenInstant, shiftDay } from './calendar-time';
export const demoStaff = StaffSchema.parse({
  user_id: 'ec421bef-f031-4416-9f30-21871b4c7d30',
  display_name: 'Alex · prøvevisning',
  role: 'technical',
  active: true,
});
export function createDemoGateway(): OperationsGateway {
  const names = [
    'Sofie Andersen',
    'Jonas & Emilie',
    'Henrik Madsen',
    'Camilla Holm',
    'Peter Sørensen',
    'Maria Nielsen',
    'Mikkel Larsen',
  ];
  const descriptions = [
    'Vi drømmer om bedre lys over spisebordet og i vores køkken. Kan I hjælpe med at finde den rigtige løsning?',
    'Vi vil gerne have lys, der tænder automatisk i indkørslen, og kan dæmpes fra telefonen.',
    'Tre lamper skal sættes op i vores nye lejlighed. Vi har lamperne, men mangler hjælpen.',
    'Vi vil samle styringen af vores belysning og få et par gode lysscenarier.',
    'Kan vores eksisterende spots skiftes til et varmere lys? Vi sender gerne billeder.',
    'Vi har aftalt at få monteret pendlerne over køkkenøen. Adgang gennem gården.',
    'Vi vil gerne have bedre lys i entréen. Opgaven er vurderet og klar til en aftale.',
  ];
  const data = new Map<string, OperationsLead>();
  const appointments = new Map<string, Appointment>();
  const histories = new Map<string, LeadEvent[]>();
  const receipts = new Map<
    string,
    { payload: string; receipt: ReturnType<typeof CommandReceiptSchema.parse> }
  >();
  names.forEach((name, i) => {
    const id = `c6d771c8-1242-4c22-8ab5-${String(i + 1).padStart(12, '0')}`;
    const date = new Date(Date.now() - (i * 17 + 2) * 3600000).toISOString();
    const lead = OperationsLeadSchema.parse({
      id,
      reference: id,
      name,
      email: `kunde${i + 1}@example.com`,
      phone: i === 2 ? '' : '+4512345678',
      postal_code: ['2100', '2820', '2200', '2000', '2500', '2300', '2400'][i],
      service: i % 2 ? 'smart-home' : 'belysning',
      description: descriptions[i],
      status:
        i < 3
          ? 'new'
          : i < 5
            ? 'clarifying'
            : i === 5
              ? 'scheduled'
              : 'qualified',
      version: 1,
      waiting_on: i === 3 ? 'customer' : i === 4 ? 'staff' : null,
      review_decision: i >= 5 ? 'approved' : 'pending',
      review_summary:
        i >= 5
          ? 'Opgaven er afgrænset og vurderet egnet til et pilotprojekt.'
          : null,
      reviewed_by: i >= 5 ? demoStaff.user_id : null,
      reviewed_at: i >= 5 ? date : null,
      created_at: date,
      updated_at: date,
    });
    data.set(id, lead);
    if (i === 5) {
      const day = shiftDay(
        copenhagenLocal(new Date().toISOString()).slice(0, 10),
        1,
      );
      const appointment = AppointmentSchema.parse({
        id: randomId(),
        lead_id: id,
        title: 'Pendler over køkkenøen',
        location: 'Eksempelvej 12, 2300 København S',
        starts_at: copenhagenInstant(`${day}T09:00`),
        ends_at: copenhagenInstant(`${day}T11:00`),
        time_zone: 'Europe/Copenhagen',
        state: 'booked',
        created_at: date,
        updated_at: date,
      });
      appointments.set(appointment.id, appointment);
    }
    histories.set(id, [
      LeadEventSchema.parse({
        id: randomId(),
        lead_id: id,
        event_type: 'lead_created',
        actor_type: 'system',
        actor_id: null,
        actor_name: null,
        lead_version: 1,
        from_status: null,
        to_status: null,
        body: null,
        details: {},
        created_at: date,
      }),
    ]);
  });
  return {
    async list(offset) {
      return {
        items: structuredClone([...data.values()].slice(offset, offset + 100)),
        hasMore: false,
      };
    },
    async lead(id) {
      const lead = data.get(id);
      if (!lead) throw new Error('Sagen findes ikke.');
      return structuredClone(lead);
    },
    async history(id) {
      return structuredClone(histories.get(id) ?? []);
    },
    async appointment(id) {
      return structuredClone(
        [...appointments.values()].find(
          (item) => item.lead_id === id && item.state === 'booked',
        ) ?? null,
      );
    },
    async calendar(from, to, offset) {
      const matches = [...appointments.values()]
        .filter(
          (item) =>
            item.state === 'booked' &&
            Date.parse(item.ends_at) > Date.parse(from) &&
            Date.parse(item.starts_at) < Date.parse(to),
        )
        .sort(
          (a, b) =>
            a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id),
        );
      return {
        items: structuredClone(
          matches
            .slice(offset, offset + 100)
            .map((item) => ({
              ...item,
              lead: {
                name: data.get(item.lead_id)!.name,
                postal_code: data.get(item.lead_id)!.postal_code,
              },
            })),
        ),
        hasMore: offset + 100 < matches.length,
      };
    },
    async execute(command) {
      const prior = receipts.get(command.commandId);
      if (prior) {
        if (prior.payload !== JSON.stringify(command))
          throw new OperationsError(
            'command_conflict',
            'Handlingen er ændret.',
          );
        return prior.receipt;
      }
      const lead = data.get(command.leadId)!;
      if (lead.version !== command.expectedVersion)
        throw new OperationsError(
          'lead_version_conflict',
          'Sagen er ændret. Hent den seneste version.',
        );
      const old = lead.status;
      let kind = 'note_added';
      let body: string | null = null;
      let details: Record<string, unknown> = {};
      if (command.kind === 'status') {
        if (!availableTransitions(lead).includes(command.status))
          throw new Error('Vurder opgaven fagligt før dette trin.');
        if (
          (['rejected', 'outside_scope', 'cancelled'].includes(
            command.status,
          ) ||
            ['rejected', 'outside_scope', 'cancelled'].includes(old)) &&
          command.reason.trim().length < 3
        )
          throw new Error('Skriv en kort begrundelse.');
        lead.status = command.status;
        if (old === 'scheduled') {
          const booking = [...appointments.values()].find(
            (item) => item.lead_id === lead.id && item.state === 'booked',
          )!;
          details.appointmentBefore = structuredClone(booking);
          booking.state = 'cancelled';
          booking.updated_at = new Date().toISOString();
          details.appointmentAfter = structuredClone(booking);
        }
        lead.waiting_on = lead.status === 'clarifying' ? 'staff' : null;
        kind = 'status_changed';
        body = command.reason || null;
      } else if (command.kind === 'review') {
        if (lead.status === 'qualified' && command.decision === 'declined')
          throw new Error('Flyt først sagen til Afklaring.');
        details = { from: lead.review_decision, to: command.decision };
        lead.review_decision = command.decision;
        lead.review_summary = command.summary;
        lead.reviewed_by = demoStaff.user_id;
        lead.reviewed_at = new Date().toISOString();
        kind = 'review_recorded';
        body = command.summary;
      } else if (command.kind === 'waiting') {
        details = { from: lead.waiting_on, to: command.waitingOn };
        lead.waiting_on = command.waitingOn;
        kind = 'waiting_changed';
      } else if (command.kind === 'note') body = command.body;
      else {
        let booking = [...appointments.values()].find(
          (item) => item.lead_id === lead.id && item.state === 'booked',
        );
        if (command.kind === 'appointment_create') {
          if (
            lead.status !== 'qualified' ||
            lead.review_decision !== 'approved' ||
            booking
          )
            throw new Error('Sagen skal være klar til aftale.');
          booking = AppointmentSchema.parse({
            id: randomId(),
            lead_id: lead.id,
            title: command.title,
            location: command.location,
            starts_at: command.startsAt,
            ends_at: command.endsAt,
            time_zone: 'Europe/Copenhagen',
            state: 'booked',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          appointments.set(booking.id, booking);
          lead.status = 'scheduled';
          lead.waiting_on = null;
          kind = 'appointment_created';
        } else {
          if (
            !booking ||
            booking.id !== command.appointmentId ||
            lead.status !== 'scheduled'
          )
            throw new Error('Aftalen findes ikke længere.');
          details.appointmentBefore = structuredClone(booking);
          body = command.reason;
          if (command.kind === 'appointment_cancel') {
            booking.state = 'cancelled';
            lead.status = 'clarifying';
            lead.waiting_on = 'staff';
            kind = 'appointment_cancelled';
          } else {
            if (
              booking.starts_at === command.startsAt &&
              booking.ends_at === command.endsAt &&
              booking.title === command.title &&
              booking.location === command.location
            )
              throw new Error('Aftalen er uændret.');
            Object.assign(booking, {
              title: command.title,
              location: command.location,
              starts_at: command.startsAt,
              ends_at: command.endsAt,
            });
            kind = 'appointment_rescheduled';
          }
          booking.updated_at = new Date().toISOString();
        }
        details.appointmentAfter = structuredClone(booking);
      }
      lead.version = OperationsLeadSchema.shape.version.parse(lead.version + 1);
      lead.updated_at = new Date().toISOString();
      const event = LeadEventSchema.parse({
        id: randomId(),
        lead_id: lead.id,
        event_type: kind,
        actor_type: 'staff',
        actor_id: demoStaff.user_id,
        actor_name: demoStaff.display_name,
        lead_version: lead.version,
        from_status: old,
        to_status: lead.status,
        body,
        details,
        created_at: lead.updated_at,
      });
      histories.get(lead.id)!.unshift(event);
      const receipt = CommandReceiptSchema.parse({
        leadId: lead.id,
        version: lead.version,
        eventId: event.id,
      });
      receipts.set(command.commandId, {
        payload: JSON.stringify(command),
        receipt,
      });
      return receipt;
    },
  };
}
