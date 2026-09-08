/**
 * Demo scenarios.
 *
 * Fixtures supply *inputs only*: the mandate wording, the proposed action, and which
 * approved source to read. They never supply a verdict, a consensus result, a
 * transaction status or contract state. Every outcome shown in the console is read
 * back from the contract after it decided.
 */

export const EVIDENCE_PATH = '/evidence/amsterdam-2026-schedule.html';
export const ORIGINAL_EVIDENCE_PATH = '/evidence/amsterdam-2026-schedule-original.html';

/**
 * The approved evidence source. GenLayer validators fetch this URL themselves, so it
 * has to be reachable from the public internet: a localhost origin cannot work.
 */
export const evidenceBaseUrl = (): string => {
  const configured = process.env.NEXT_PUBLIC_EVIDENCE_BASE_URL;
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
};

export const evidenceUrl = (path = EVIDENCE_PATH) => `${evidenceBaseUrl()}${path}`;

export const isEvidenceReachable = () => {
  const base = evidenceBaseUrl();
  return base.startsWith('https://') && !base.includes('localhost') && !base.includes('127.0.0.1');
};

export const MANDATE_TEMPLATE = {
  intentText:
    'Book the cheapest refundable flight to my conference under EUR 900, as long as I arrive before the opening session.',
  purposeText: 'Attend the conference in full, including the opening session.',
  actionType: 'travel.flight_booking',
  semanticConditions:
    'The traveller must land at the destination before the conference opening session begins. Never book a non-refundable flight.',
  reconfirmPolicy:
    'Any change to a purpose-critical timing condition requires fresh approval from the principal before execution.',
  hardConstraints: [
    { label: 'Budget', field: 'price_eur', op: 'lte', value: 900 },
    { label: 'Destination', field: 'arrival_airport', op: 'eq', value: 'AMS' },
    { label: 'Refundability', field: 'refundable', op: 'is_true' },
  ],
  evidenceQuestion: {
    qid: 'conference_opening',
    question: 'What is the current local start time of the conference opening session?',
    answer_schema: 'HH:MM in 24-hour local time, or NOT_FOUND',
    fallback_claim: '',
  },
};

export interface FlightPayload extends Record<string, unknown> {
  carrier: string;
  flight_number: string;
  origin_airport: string;
  arrival_airport: string;
  arrival_local_time: string;
  arrival_date: string;
  price_eur: number;
  refundable: boolean;
  fare_class: string;
}

export const flight = (
  overrides: Partial<FlightPayload> = {},
): FlightPayload => ({
  carrier: 'KL',
  flight_number: 'KL588',
  origin_airport: 'LOS',
  arrival_airport: 'AMS',
  arrival_local_time: '10:30',
  arrival_date: '2026-10-14',
  price_eur: 741,
  refundable: true,
  fare_class: 'Economy Flex',
  ...overrides,
});

export const summarise = (payload: FlightPayload) =>
  `${payload.origin_airport} → ${payload.arrival_airport}, EUR ${payload.price_eur}, arrives ${payload.arrival_local_time}${
    payload.refundable ? ', refundable' : ', NON-REFUNDABLE'
  }`;

export interface Scenario {
  key: 'a' | 'b' | 'c';
  name: string;
  premise: string;
  exercises: string;
  payload: FlightPayload;
}

export const SCENARIOS: Scenario[] = [
  {
    key: 'a',
    name: 'Scenario A — context drift',
    premise:
      'A formally valid flight. The conference opening then moved earlier, so arriving at 10:30 no longer serves the purpose the mandate was granted for.',
    exercises:
      'Deterministic checks all pass, so the semantic checkpoint has to catch the drift.',
    payload: flight({ arrival_local_time: '10:30' }),
  },
  {
    key: 'b',
    name: 'Scenario B — intent still satisfied',
    premise:
      'The same mandate, an earlier arrival. Nothing about the principal’s purpose has been broken.',
    exercises: 'The checkpoint should clear the action and open a single-use execution approval.',
    payload: flight({ arrival_local_time: '06:45' }),
  },
  {
    key: 'c',
    name: 'Scenario C — explicit prohibition',
    premise: 'A non-refundable fare, which the mandate rules out in writing.',
    exercises:
      'A deterministic hard constraint decides this one. No model is invoked and no evidence is fetched.',
    payload: flight({ arrival_local_time: '06:45', refundable: false }),
  },
];
