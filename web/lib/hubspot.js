const HUBSPOT_BASE = 'https://api.hubapi.com';
const authHeaders = () => ({
  Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
  'Content-Type': 'application/json'
});

async function findContact({ email, phone }) {
  const filters = email ? [{ propertyName: 'email', operator: 'EQ', value: email }]
    : phone ? [{ propertyName: 'phone', operator: 'EQ', value: phone }] : null;
  if (!filters) return null;
  const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts/search`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ filterGroups: [{ filters }], limit: 1 })
  });
  const data = await res.json();
  return data.results?.[0] || null;
}

// Creates a new HubSpot contact, or updates the existing one if it already exists —
// so a repeat caller or a re-submitted form doesn't create duplicate records.
async function createOrUpdateContact({ email, phone, fullName, serviceInterest, qualificationScore }) {
  if (!email && !phone) return null;
  const [firstname, ...rest] = (fullName || '').split(' ');
  const properties = {
    email, phone, firstname, lastname: rest.join(' '),
    service_interest: serviceInterest,
    ...(qualificationScore !== undefined ? { qualification_score: String(qualificationScore) } : {})
  };
  Object.keys(properties).forEach(k => (properties[k] === undefined || properties[k] === '') && delete properties[k]);

  const existing = await findContact({ email, phone });
  if (existing) {
    await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts/${existing.id}`, {
      method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ properties })
    });
    return existing.id;
  }
  const res = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify({ properties })
  });
  const data = await res.json();
  return data.id;
}

// Logs a call as a HubSpot activity on the contact's timeline.
async function logCallActivity(contactId, summary) {
  await fetch(`${HUBSPOT_BASE}/crm/v3/objects/calls`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({
      properties: { hs_call_body: summary, hs_timestamp: Date.now() },
      associations: contactId
        ? [{ to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 194 }] }]
        : []
    })
  });
}

module.exports = { findContact, createOrUpdateContact, logCallActivity };
