require('dotenv').config({ path: '../.env' });

async function testHubSpot() {
  const res = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: { firstname: 'Test', lastname: 'Lead', email: 'test-lead@example.com' }
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  console.log('Created contact:', data.id);
}
testHubSpot().catch(e => console.error(e.message));
