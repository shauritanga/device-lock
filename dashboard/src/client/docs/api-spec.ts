/**
 * Single source of truth for the partner API documentation. The Documentation tab renders
 * from these definitions and the downloadable OpenAPI file is generated from them, so the
 * two cannot drift. Keep in sync with backend/src/partners/*.
 */

export const DEVICE_ID = '7d1c0f5a-3b8e-4c52-9a41-2f6e8b0d9c13';
export const COMMAND_ID = 'b2e4a9d0-61c7-4f38-8e5a-0c9d7f1a3e42';
export const SAMPLE_IMEI = '356938035643809';

type Json = Record<string, unknown>;

export type Field = {
  name: string;
  type: string;
  required?: boolean;
  description: string;
  example?: string;
};

export type ResponseDoc = {
  status: number;
  description: string;
  /** Component schema name, for OpenAPI `$ref`. */
  schema?: string;
  example?: unknown;
  headers?: Record<string, string>;
};

export type Endpoint = {
  id: string;
  method: 'GET' | 'POST';
  /** OpenAPI style path, relative to the base URL. */
  path: string;
  summary: string;
  description: string;
  pathParams?: Field[];
  query?: Field[];
  body?: Field[];
  /** Example request body. */
  bodyExample?: Json;
  /** Component schema name of the request body, for OpenAPI. Defaults to LockRequest. */
  bodySchema?: string;
  /** OpenAPI tag. Defaults to Devices (Commands for /commands). */
  tag?: 'Sync' | 'Devices' | 'Commands';
  responses: ResponseDoc[];
};

export const DEVICE_STATUSES: { value: string; meaning: string }[] = [
  { value: 'PENDING_ENROLLMENT', meaning: 'Registered but the phone has not finished setup yet. Cannot be locked.' },
  { value: 'ACTIVE', meaning: 'Enrolled and in good standing. Can be locked.' },
  { value: 'LOCKED', meaning: 'The phone confirmed it is locked. Can be unlocked.' },
  { value: 'RELEASED', meaning: 'Loan completed and management removed. Final — cannot be locked.' },
  { value: 'DEFAULTED', meaning: 'Written off.' },
  { value: 'WIPED', meaning: 'Wiped. Final — cannot be locked.' },
];

export const COMMAND_STATUSES: { value: string; meaning: string }[] = [
  { value: 'QUEUED', meaning: 'Accepted and waiting to reach the phone.' },
  { value: 'SENT', meaning: 'Delivered to the phone (push or when it checked in); awaiting its confirmation.' },
  { value: 'ACKED', meaning: 'The phone confirmed it carried the command out. Final.' },
  { value: 'FAILED', meaning: 'The phone reported it could not carry the command out. Final.' },
  { value: 'EXPIRED', meaning: 'Reserved. It is not set automatically today, so apply your own timeout to commands that stay QUEUED or SENT.' },
];

const deviceExample = {
  id: DEVICE_ID,
  imei: SAMPLE_IMEI,
  externalId: 'asset-9001',
  serialNumber: 'R58N30ABCDE',
  make: 'Samsung',
  model: 'Galaxy A15',
  status: 'ACTIVE',
  lockedAt: null,
  lastCheckInAt: '2026-10-31T08:12:44.000Z',
  loanStatus: 'ACTIVE',
};

const commandExample = {
  id: COMMAND_ID,
  deviceId: DEVICE_ID,
  type: 'LOCK',
  status: 'QUEUED',
  reason: '3 installments overdue',
  createdAt: '2026-10-31T09:00:00.000Z',
  sentAt: null,
  ackedAt: null,
  expiresAt: '2026-11-07T09:00:00.000Z',
};

const CUSTOMER_ID = '3c9a41d7-0e52-4b8f-a6c1-5d7e2f904b18';

const customerExample = {
  id: CUSTOMER_ID,
  externalId: 'cust-5521',
  fullName: 'Neema Joseph',
  phone: '255711000111',
  nationalId: '19900412-12345-00001-21',
  idDocumentType: 'NATIONAL_ID',
  address: 'Mwanza',
  createdAt: '2026-10-31T08:55:00.000Z',
};

const enrollmentExample = {
  token: '9f1c7a0e5b3d44d28a6e1f0c2b7d9a53c4e8f1a60b2d3c47',
  expiresAt: '2026-11-07T08:55:00.000Z',
  qr: {
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME': 'com.devicelock.agent/.LockAdminReceiver',
    '…': 'Encode this object as JSON into the QR code exactly as returned.',
  },
};

const registeredDeviceExample = {
  id: DEVICE_ID,
  externalId: 'asset-9001',
  imei: SAMPLE_IMEI,
  serialNumber: null,
  make: 'Samsung',
  model: 'Galaxy A15',
  status: 'PENDING_ENROLLMENT',
  customerId: CUSTOMER_ID,
  createdAt: '2026-10-31T08:55:00.000Z',
  enrollment: enrollmentExample,
};

const customerBody: Field[] = [
  { name: 'externalId', type: 'string', description: 'The customer’s id in your system (up to 128 characters). Strongly recommended: it is how a repeat call finds the same customer.', example: 'cust-5521' },
  { name: 'fullName', type: 'string', required: true, description: '2–160 characters.', example: 'Neema Joseph' },
  { name: 'phone', type: 'string', required: true, description: 'Mobile number, 7–20 characters. Unique per company; we use the format 255712345678.', example: '255711000111' },
  { name: 'nationalId', type: 'string', description: 'ID document number.', example: '19900412-12345-00001-21' },
  { name: 'idDocumentType', type: 'string', description: 'One of NATIONAL_ID, VOTER_ID, DRIVING_LICENSE, PASSPORT.', example: 'NATIONAL_ID' },
  { name: 'address', type: 'string', description: 'Home address.', example: 'Mwanza' },
];

const deviceBody: Field[] = [
  { name: 'externalId', type: 'string', description: 'The phone’s (asset’s) id in your system. Recommended.', example: 'asset-9001' },
  { name: 'imei', type: 'string', required: true, description: '14 to 17 digits. Unique per company.', example: SAMPLE_IMEI },
  { name: 'make', type: 'string', description: 'Brand.', example: 'Samsung' },
  { name: 'model', type: 'string', description: 'Model.', example: 'Galaxy A15' },
  { name: 'serialNumber', type: 'string', description: 'Serial number, if you have it.' },
];

const err = (statusCode: number, error: string, message: string | string[]) => ({
  statusCode,
  error,
  message,
});

const commonErrors = (extra: ResponseDoc[] = []): ResponseDoc[] => [
  ...extra,
  {
    status: 401,
    description: 'Missing, invalid, or revoked API key.',
    schema: 'Error',
    example: err(401, 'Unauthorized', 'Invalid or inactive API key'),
  },
  {
    status: 429,
    description: 'Rate limit exceeded. Wait for `Retry-After` seconds.',
    schema: 'Error',
    example: err(429, 'Too Many Requests', 'Rate limit exceeded'),
    headers: { 'Retry-After': '42' },
  },
];

const idParam = (what: string): Field => ({
  name: 'id',
  type: 'string (uuid)',
  required: true,
  description: `The ${what} id.`,
  example: what === 'device' ? DEVICE_ID : COMMAND_ID,
});

const lockBody: Field[] = [
  {
    name: 'reason',
    type: 'string',
    required: true,
    description: 'Why you are doing this (3–300 characters). Stored for audit.',
    example: '3 installments overdue',
  },
  {
    name: 'idempotencyKey',
    type: 'string',
    required: true,
    description:
      'A unique value you choose (8–128 characters). Retrying with the same key never queues a second command.',
    example: 'loan-1001-lock-1',
  },
];

export const ENDPOINTS: Endpoint[] = [
  {
    id: 'register-sale',
    method: 'POST',
    path: '/registrations',
    tag: 'Sync',
    summary: 'Register a customer and phone together',
    description:
      'Call this when a sale is created in your system. It creates the customer and the phone here in one request, so nobody enters them twice. It is safe to call again: customers are matched by `externalId` (then phone number) and phones by IMEI (then `externalId`), so a repeat returns what already exists with `200` and creates nothing. A phone that has not enrolled yet comes back with the `enrollment` payload for the setup QR code. Requires a key that is not read-only.',
    body: [
      { name: 'customer', type: 'object', required: true, description: 'The customer. Same fields as Create or update a customer.' },
      { name: 'device', type: 'object', required: true, description: 'The phone. Same fields as Register a phone, without the customer link (it is made for you).' },
    ],
    bodySchema: 'RegistrationRequest',
    bodyExample: {
      customer: { externalId: 'cust-5521', fullName: 'Neema Joseph', phone: '255711000111', nationalId: '19900412-12345-00001-21', idDocumentType: 'NATIONAL_ID', address: 'Mwanza' },
      device: { externalId: 'asset-9001', imei: SAMPLE_IMEI, make: 'Samsung', model: 'Galaxy A15' },
    },
    responses: [
      {
        status: 201,
        description: 'Something new was created. `created` says what.',
        schema: 'Registration',
        example: { customer: customerExample, device: registeredDeviceExample, created: { customer: true, device: true } },
      },
      {
        status: 200,
        description: 'Both already existed; nothing was created. The records are returned as they are now.',
        schema: 'Registration',
        example: { customer: customerExample, device: { ...registeredDeviceExample, status: 'ACTIVE', enrollment: null }, created: { customer: false, device: false } },
      },
      {
        status: 400,
        description: 'A field is missing or invalid.',
        schema: 'Error',
        example: err(400, 'Bad Request', ['customer.fullName must be longer than or equal to 2 characters', 'device.imei must be longer than or equal to 14 characters']),
      },
      {
        status: 403,
        description: 'The key is read-only, your company is inactive, or your company may not enrol phones yet (agreement not signed, or no phones left on your plan).',
        schema: 'Error',
        example: err(403, 'Forbidden', 'This API key is read-only'),
      },
      {
        status: 409,
        description: 'A conflict with existing records: that phone number belongs to another customer, or the IMEI is registered to a different customer.',
        schema: 'Error',
        example: err(409, 'Conflict', 'That phone number already belongs to a different customer in this company'),
      },
      ...commonErrors(),
    ],
  },
  {
    id: 'upsert-customer',
    method: 'POST',
    path: '/customers',
    tag: 'Sync',
    summary: 'Create or update a customer',
    description:
      'Creates the customer, or updates it when it already exists (matched by `externalId`, then by phone number). Use it on its own when the customer is created or edited before there is a phone, or to keep names and addresses up to date. Fields you leave out are not changed.',
    body: customerBody,
    bodySchema: 'CustomerRequest',
    bodyExample: { externalId: 'cust-5521', fullName: 'Neema Joseph', phone: '255711000111', address: 'Mwanza' },
    responses: [
      { status: 201, description: 'Customer created.', schema: 'Customer', example: customerExample },
      { status: 200, description: 'Customer already existed and was updated.', schema: 'Customer', example: customerExample },
      {
        status: 409,
        description: 'The phone number belongs to a different customer, or that customer already has another `externalId`.',
        schema: 'Error',
        example: err(409, 'Conflict', 'A customer with this phone number already exists under a different externalId'),
      },
      { status: 400, description: 'A field is missing or invalid.', schema: 'Error', example: err(400, 'Bad Request', ['phone must be longer than or equal to 7 characters']) },
      { status: 403, description: 'The key is read-only, or your company is inactive.', schema: 'Error', example: err(403, 'Forbidden', 'This API key is read-only') },
      ...commonErrors(),
    ],
  },
  {
    id: 'register-device',
    method: 'POST',
    path: '/devices',
    tag: 'Sync',
    summary: 'Register a phone',
    description:
      'Registers a phone, or returns it if the IMEI (or `externalId`) is already known. Link it to a customer with `customerId` (our id) or `externalCustomerId` (yours); the customer must already exist. A phone that has not enrolled yet comes back with an `enrollment` payload: encode `enrollment.qr` as JSON into a QR code and scan it on the factory-reset phone.',
    body: [
      ...deviceBody,
      { name: 'customerId', type: 'string (uuid)', description: 'Our id of an existing customer.', example: CUSTOMER_ID },
      { name: 'externalCustomerId', type: 'string', description: 'Your id of a customer you already created here. Use this or `customerId`.', example: 'cust-5521' },
    ],
    bodySchema: 'DeviceRequest',
    bodyExample: { externalId: 'asset-9001', imei: SAMPLE_IMEI, make: 'Samsung', model: 'Galaxy A15', externalCustomerId: 'cust-5521' },
    responses: [
      { status: 201, description: 'Phone registered.', schema: 'RegisteredDevice', example: registeredDeviceExample },
      { status: 200, description: 'The phone was already registered; it is returned as it is now.', schema: 'RegisteredDevice', example: registeredDeviceExample },
      {
        status: 403,
        description: 'The key is read-only, your company is inactive, or your company may not enrol phones yet (agreement not signed, or no phones left on your plan).',
        schema: 'Error',
        example: err(403, 'Forbidden', 'Sign the service agreement before enrolling devices'),
      },
      {
        status: 404,
        description: 'The customer you named does not exist here.',
        schema: 'Error',
        example: err(404, 'Not Found', 'No customer with that externalCustomerId — create the customer first, or use /partner/registrations'),
      },
      {
        status: 409,
        description: 'The phone is already registered to a different customer, or the IMEI and `externalId` point at two different phones.',
        schema: 'Error',
        example: err(409, 'Conflict', 'This device is already registered to a different customer'),
      },
      { status: 400, description: 'A field is missing or invalid.', schema: 'Error', example: err(400, 'Bad Request', ['imei must be longer than or equal to 14 characters']) },
      ...commonErrors(),
    ],
  },
  {
    id: 'get-enrollment',
    method: 'GET',
    path: '/devices/{id}/enrollment',
    tag: 'Sync',
    summary: 'Get the enrollment QR payload again',
    description:
      'Returns the setup payload for a phone that has not enrolled yet. If the earlier one expired or was used, a fresh one is issued. Once the phone has enrolled there is nothing to scan and this returns `409`.',
    pathParams: [idParam('device')],
    responses: [
      { status: 200, description: 'The phone with its `enrollment` payload.', schema: 'RegisteredDevice', example: registeredDeviceExample },
      { status: 404, description: 'No such device in your company.', schema: 'Error', example: err(404, 'Not Found', 'Device not found') },
      { status: 409, description: 'The phone already enrolled.', schema: 'Error', example: err(409, 'Conflict', 'This device has already enrolled; there is nothing to scan') },
      ...commonErrors(),
    ],
  },
  {
    id: 'lookup-device',
    method: 'GET',
    path: '/devices/lookup',
    summary: 'Find a device by IMEI or your own id',
    description:
      'Returns the phone with this IMEI — or this `externalId` — if it belongs to your company. Give one of the two. Use it to map your own record to our device id, then store the id.',
    query: [
      {
        name: 'imei',
        type: 'string',
        description: '14 to 17 digits. Give this or `externalId`.',
        example: SAMPLE_IMEI,
      },
      {
        name: 'externalId',
        type: 'string',
        description: 'The id you gave the phone when you registered it.',
      },
    ],
    responses: [
      { status: 200, description: 'The device.', schema: 'Device', example: deviceExample },
      {
        status: 400,
        description: 'IMEI is not 14–17 digits.',
        schema: 'Error',
        example: err(400, 'Bad Request', 'imei must be 14-17 digits (or pass externalId)'),
      },
      {
        status: 404,
        description: 'No such device in your company.',
        schema: 'Error',
        example: err(404, 'Not Found', 'Device not found'),
      },
      ...commonErrors(),
    ],
  },
  {
    id: 'get-device',
    method: 'GET',
    path: '/devices/{id}',
    summary: 'Get a device',
    description:
      'Current status of one device, plus the most recent command sent to it (from any source). Use it to reconcile your records with ours.',
    pathParams: [idParam('device')],
    responses: [
      {
        status: 200,
        description: 'The device and its latest command (null if none).',
        schema: 'DeviceWithCommand',
        example: { ...deviceExample, status: 'LOCKED', lockedAt: '2026-10-31T09:00:31.000Z', lastCommand: { ...commandExample, status: 'ACKED', sentAt: '2026-10-31T09:00:01.000Z', ackedAt: '2026-10-31T09:00:31.000Z' } },
      },
      {
        status: 400,
        description: 'The id is not a valid UUID.',
        schema: 'Error',
        example: err(400, 'Bad Request', 'Validation failed (uuid is expected)'),
      },
      {
        status: 404,
        description: 'No such device in your company.',
        schema: 'Error',
        example: err(404, 'Not Found', 'Device not found'),
      },
      ...commonErrors(),
    ],
  },
  {
    id: 'lock-device',
    method: 'POST',
    path: '/devices/{id}/lock',
    summary: 'Lock a device',
    description:
      'Queues a lock. The response means “accepted”, not “locked”: the phone locks when it receives the command, which may be minutes later — or when it next connects if it is offline. Wait for the `device.locked` webhook, or poll the command. Requires a key that is not read-only.',
    pathParams: [idParam('device')],
    body: lockBody,
    bodyExample: { reason: '3 installments overdue', idempotencyKey: 'loan-1001-lock-1' },
    responses: [
      {
        status: 202,
        description: 'Lock queued. Keep `id` to track it.',
        schema: 'Command',
        example: { ...commandExample, idempotentReplay: false },
      },
      {
        status: 200,
        description: 'Same `idempotencyKey` as an earlier request: that command is returned and nothing new is queued.',
        schema: 'Command',
        example: { ...commandExample, idempotentReplay: true },
      },
      {
        status: 400,
        description: 'Missing or invalid field.',
        schema: 'Error',
        example: err(400, 'Bad Request', [
          'reason must be longer than or equal to 3 characters',
          'idempotencyKey must be longer than or equal to 8 characters',
        ]),
      },
      {
        status: 403,
        description: 'The key is read-only, or your company is inactive.',
        schema: 'Error',
        example: err(403, 'Forbidden', 'This API key is read-only'),
      },
      {
        status: 404,
        description: 'No such device in your company.',
        schema: 'Error',
        example: err(404, 'Not Found', 'Device not found'),
      },
      {
        status: 409,
        description:
          'The device cannot be locked now: it is already locked, not enrolled yet, released or wiped, a lock is already in progress, or the `idempotencyKey` was used for a different request.',
        schema: 'Error',
        example: err(409, 'Conflict', 'Device is already locked'),
      },
      ...commonErrors(),
    ],
  },
  {
    id: 'unlock-device',
    method: 'POST',
    path: '/devices/{id}/unlock',
    summary: 'Unlock a device',
    description:
      'Queues an unlock for a device that is currently locked. Same asynchronous behaviour as lock: wait for the `device.unlocked` webhook or poll the command.',
    pathParams: [idParam('device')],
    body: lockBody,
    bodyExample: { reason: 'Loan paid in full', idempotencyKey: 'loan-1001-unlock-1' },
    responses: [
      {
        status: 202,
        description: 'Unlock queued.',
        schema: 'Command',
        example: { ...commandExample, type: 'UNLOCK', reason: 'Loan paid in full', idempotentReplay: false },
      },
      {
        status: 200,
        description: 'Idempotent replay of an earlier request.',
        schema: 'Command',
        example: { ...commandExample, type: 'UNLOCK', idempotentReplay: true },
      },
      {
        status: 409,
        description: 'The device is not locked, is not enrolled, is released or wiped, an unlock is already in progress, or the `idempotencyKey` was reused for a different request.',
        schema: 'Error',
        example: err(409, 'Conflict', 'Device is not locked'),
      },
      {
        status: 403,
        description: 'The key is read-only, or your company is inactive.',
        schema: 'Error',
        example: err(403, 'Forbidden', 'This API key is read-only'),
      },
      {
        status: 404,
        description: 'No such device in your company.',
        schema: 'Error',
        example: err(404, 'Not Found', 'Device not found'),
      },
      ...commonErrors(),
    ],
  },
  {
    id: 'get-command',
    method: 'GET',
    path: '/commands/{id}',
    summary: 'Get a command',
    description:
      'Progress of a lock or unlock you issued. You can only read commands created with your own keys. Prefer webhooks to polling; if you do poll, wait at least 5 seconds between calls.',
    pathParams: [idParam('command')],
    responses: [
      {
        status: 200,
        description: 'The command.',
        schema: 'Command',
        example: { ...commandExample, status: 'ACKED', sentAt: '2026-10-31T09:00:01.000Z', ackedAt: '2026-10-31T09:00:31.000Z' },
      },
      {
        status: 404,
        description: 'No such command for your keys.',
        schema: 'Error',
        example: err(404, 'Not Found', 'Command not found'),
      },
      ...commonErrors(),
    ],
  },
];

export const WEBHOOK_EVENTS: { type: string; meaning: string; example: unknown }[] = [
  {
    type: 'device.locked',
    meaning: 'The phone confirmed it is now locked.',
    example: webhook('device.locked', { commandType: 'LOCK', result: 'DONE', deviceStatus: 'LOCKED', detail: null }),
  },
  {
    type: 'device.unlocked',
    meaning: 'The phone confirmed it is now unlocked.',
    example: webhook('device.unlocked', { commandType: 'UNLOCK', result: 'DONE', deviceStatus: 'ACTIVE', detail: null }),
  },
  {
    type: 'command.failed',
    meaning: 'The phone reported it could not carry out a lock or unlock. The device state is unchanged.',
    example: webhook('command.failed', { commandType: 'LOCK', result: 'FAILED', deviceStatus: null, detail: 'agent offline' }),
  },
  {
    type: 'webhook.test',
    meaning: 'Sent when you press “Send test event”. Use it to check your endpoint and signature code.',
    example: {
      id: 'f3a1c9e2-5d47-4b08-9c6e-1a2b3c4d5e6f',
      type: 'webhook.test',
      createdAt: '2026-10-31T09:00:31.000Z',
      data: { message: 'Test delivery' },
    },
  },
];

function webhook(type: string, extra: Json) {
  return {
    id: 'e8c4d1a7-92b3-4f6e-8a05-7d3c2b1a0f94',
    type,
    createdAt: '2026-10-31T09:00:31.000Z',
    data: {
      commandId: COMMAND_ID,
      deviceId: DEVICE_ID,
      ...extra,
      idempotencyKey: 'loan-1001-lock-1',
      occurredAt: '2026-10-31T09:00:31.000Z',
    },
  };
}

export const ERROR_TABLE: { status: number; name: string; meaning: string; action: string }[] = [
  { status: 400, name: 'Bad Request', meaning: 'A field is missing or invalid, or an id is not a UUID.', action: 'Fix the request. Do not retry unchanged.' },
  { status: 401, name: 'Unauthorized', meaning: 'No key, wrong key, or the key was revoked or rolled.', action: 'Check the key. Do not retry unchanged.' },
  { status: 403, name: 'Forbidden', meaning: 'The key is read-only, your company is inactive, or it may not enrol phones yet (agreement not signed, or no phones left on its plan).', action: 'Use a full-access key, or contact support.' },
  { status: 404, name: 'Not Found', meaning: 'The device, command or customer does not exist for your company.', action: 'Check the id. Records of other companies always appear as 404.' },
  { status: 409, name: 'Conflict', meaning: 'The device is in a state that does not allow this action, an idempotency key was reused for a different request, or a customer or phone you sent clashes with a different record (same phone number or IMEI, different customer).', action: 'Read the message; refresh the device state before deciding what to do.' },
  { status: 429, name: 'Too Many Requests', meaning: 'You exceeded your per-minute limit.', action: 'Wait for Retry-After seconds, then retry.' },
  { status: 500, name: 'Server Error', meaning: 'Something went wrong on our side.', action: 'Retry with the same idempotencyKey and exponential backoff.' },
];

// ---------------------------------------------------------------------------
// OpenAPI 3.1 document
// ---------------------------------------------------------------------------

const nullable = (type: string, extra: Json = {}) => ({ type: [type, 'null'], ...extra });

const SCHEMAS: Record<string, Json> = {
  Error: {
    type: 'object',
    required: ['statusCode', 'message', 'error'],
    properties: {
      statusCode: { type: 'integer', example: 409 },
      error: { type: 'string', example: 'Conflict' },
      message: {
        oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
        description: 'A string, or a list of strings for validation errors.',
      },
    },
  },
  Device: {
    type: 'object',
    required: ['id', 'imei', 'status'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      externalId: nullable('string', { description: 'Your id for the phone, if you gave one.' }),
      imei: { type: 'string' },
      serialNumber: nullable('string'),
      make: nullable('string'),
      model: nullable('string'),
      status: { type: 'string', enum: DEVICE_STATUSES.map((s) => s.value) },
      lockedAt: nullable('string', { format: 'date-time' }),
      lastCheckInAt: nullable('string', { format: 'date-time' }),
      loanStatus: {
        type: ['string', 'null'],
        enum: ['ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED', null],
        description: 'Status of the loan attached to the device, if any.',
      },
    },
  },
  Customer: {
    type: 'object',
    required: ['id', 'fullName', 'phone'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      externalId: nullable('string'),
      fullName: { type: 'string' },
      phone: { type: 'string' },
      nationalId: nullable('string'),
      idDocumentType: { type: ['string', 'null'], enum: ['NATIONAL_ID', 'VOTER_ID', 'DRIVING_LICENSE', 'PASSPORT', null] },
      address: nullable('string'),
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  CustomerRequest: {
    type: 'object',
    required: ['fullName', 'phone'],
    properties: {
      externalId: { type: 'string', maxLength: 128 },
      fullName: { type: 'string', minLength: 2, maxLength: 160 },
      phone: { type: 'string', minLength: 7, maxLength: 20 },
      nationalId: { type: 'string' },
      idDocumentType: { type: 'string', enum: ['NATIONAL_ID', 'VOTER_ID', 'DRIVING_LICENSE', 'PASSPORT'] },
      address: { type: 'string', maxLength: 300 },
    },
  },
  DeviceRequest: {
    type: 'object',
    required: ['imei'],
    properties: {
      externalId: { type: 'string', maxLength: 128 },
      imei: { type: 'string', minLength: 14, maxLength: 17 },
      serialNumber: { type: 'string' },
      make: { type: 'string' },
      model: { type: 'string' },
      customerId: { type: 'string', format: 'uuid' },
      externalCustomerId: { type: 'string', maxLength: 128 },
    },
  },
  RegistrationRequest: {
    type: 'object',
    required: ['customer', 'device'],
    properties: {
      customer: { $ref: '#/components/schemas/CustomerRequest' },
      device: {
        type: 'object',
        required: ['imei'],
        properties: {
          externalId: { type: 'string', maxLength: 128 },
          imei: { type: 'string', minLength: 14, maxLength: 17 },
          serialNumber: { type: 'string' },
          make: { type: 'string' },
          model: { type: 'string' },
        },
      },
    },
  },
  Enrollment: {
    type: 'object',
    properties: {
      token: { type: 'string' },
      expiresAt: { type: 'string', format: 'date-time' },
      qr: { type: 'object', additionalProperties: true, description: 'Encode this object as JSON into the setup QR code, exactly as returned.' },
    },
  },
  RegisteredDevice: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      externalId: nullable('string'),
      imei: { type: 'string' },
      serialNumber: nullable('string'),
      make: nullable('string'),
      model: nullable('string'),
      status: { type: 'string', enum: DEVICE_STATUSES.map((s) => s.value) },
      customerId: nullable('string', { format: 'uuid' }),
      createdAt: { type: 'string', format: 'date-time' },
      enrollment: { oneOf: [{ $ref: '#/components/schemas/Enrollment' }, { type: 'null' }], description: 'Present while the phone has not enrolled yet; null afterwards.' },
    },
  },
  Registration: {
    type: 'object',
    properties: {
      customer: { $ref: '#/components/schemas/Customer' },
      device: { $ref: '#/components/schemas/RegisteredDevice' },
      created: {
        type: 'object',
        properties: { customer: { type: 'boolean' }, device: { type: 'boolean' } },
        description: 'Which of the two records this call created. false means it already existed.',
      },
    },
  },
  Command: {
    type: 'object',
    required: ['id', 'deviceId', 'type', 'status'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      deviceId: { type: 'string', format: 'uuid' },
      type: { type: 'string', enum: ['LOCK', 'UNLOCK', 'RELEASE', 'REMIND', 'SYNC_POLICY', 'WIPE'], description: 'Commands you issue through the API are LOCK or UNLOCK; others appear only as `lastCommand`.' },
      status: { type: 'string', enum: COMMAND_STATUSES.map((s) => s.value) },
      reason: nullable('string'),
      createdAt: { type: 'string', format: 'date-time' },
      sentAt: nullable('string', { format: 'date-time' }),
      ackedAt: nullable('string', { format: 'date-time' }),
      expiresAt: nullable('string', { format: 'date-time' }),
      idempotentReplay: { type: 'boolean', description: 'Present on lock/unlock responses. True when an earlier request with the same key was returned.' },
    },
  },
  DeviceWithCommand: {
    allOf: [
      { $ref: '#/components/schemas/Device' },
      {
        type: 'object',
        properties: { lastCommand: { oneOf: [{ $ref: '#/components/schemas/Command' }, { type: 'null' }] } },
      },
    ],
  },
  LockRequest: {
    type: 'object',
    required: ['reason', 'idempotencyKey'],
    properties: {
      reason: { type: 'string', minLength: 3, maxLength: 300 },
      idempotencyKey: { type: 'string', minLength: 8, maxLength: 128 },
    },
  },
  WebhookEvent: {
    type: 'object',
    required: ['id', 'type', 'createdAt', 'data'],
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Identical across retries — de-duplicate on this.' },
      type: { type: 'string', enum: WEBHOOK_EVENTS.map((e) => e.type) },
      createdAt: { type: 'string', format: 'date-time' },
      data: { type: 'object', additionalProperties: true },
    },
  },
};

function fieldSchema(f: Field): Json {
  const base = f.type.startsWith('string') ? 'string' : f.type;
  return {
    name: f.name,
    description: f.description,
    required: !!f.required,
    schema: { type: base, ...(f.type.includes('uuid') ? { format: 'uuid' } : {}), ...(f.example ? { example: f.example } : {}) },
  };
}

export function buildOpenApi(baseUrl: string): Json {
  const paths: Record<string, Record<string, Json>> = {};
  for (const e of ENDPOINTS) {
    const parameters = [
      ...(e.pathParams ?? []).map((p) => ({ ...fieldSchema(p), in: 'path', required: true })),
      ...(e.query ?? []).map((q) => ({ ...fieldSchema(q), in: 'query' })),
    ];
    const op: Json = {
      operationId: e.id.replace(/-(\w)/g, (_, c: string) => c.toUpperCase()),
      summary: e.summary,
      description: e.description,
      tags: [e.tag ?? (e.path.startsWith('/commands') ? 'Commands' : 'Devices')],
      ...(parameters.length ? { parameters } : {}),
      ...(e.body
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: `#/components/schemas/${e.bodySchema ?? 'LockRequest'}` },
                  example: e.bodyExample,
                },
              },
            },
          }
        : {}),
      responses: Object.fromEntries(
        e.responses.map((r) => [
          String(r.status),
          {
            description: r.description,
            ...(r.headers
              ? { headers: Object.fromEntries(Object.entries(r.headers).map(([k, v]) => [k, { schema: { type: 'string', example: v } }])) }
              : {}),
            ...(r.schema
              ? { content: { 'application/json': { schema: { $ref: `#/components/schemas/${r.schema}` }, example: r.example } } }
              : {}),
          },
        ]),
      ),
    };
    (paths[e.path] ??= {})[e.method.toLowerCase()] = op;
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Linda Device Lock — Partner API',
      version: '1.1.0',
      description:
        'Keep your customers and phones in step with this system, and lock and unlock financed phones from your own. Registration calls are idempotent, so you can retry them. Locking is asynchronous: a 202 means the command was accepted; the phone confirms later by webhook.\n\nAuthenticate with `Authorization: Bearer <API key>`. Keys are created under Developers in the seller console and act only on your company.',
    },
    servers: [{ url: baseUrl }],
    security: [{ bearerAuth: [] }],
    tags: [{ name: 'Sync' }, { name: 'Devices' }, { name: 'Commands' }],
    paths,
    webhooks: Object.fromEntries(
      WEBHOOK_EVENTS.map((w) => [
        w.type,
        {
          post: {
            summary: w.meaning,
            description:
              'Signed with `X-DeviceLock-Signature: t=<unix>,v1=<hex>` — HMAC-SHA256 of `<t>.<raw body>` using your signing secret. Reply with any 2xx.',
            requestBody: {
              content: { 'application/json': { schema: { $ref: '#/components/schemas/WebhookEvent' }, example: w.example } },
            },
            responses: { '200': { description: 'Acknowledged.' } },
          },
        },
      ]),
    ),
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'API key beginning `dlk_live_`.' } },
      schemas: SCHEMAS,
    },
  };
}
