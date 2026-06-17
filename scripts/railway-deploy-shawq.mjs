const environmentId = process.env.RAILWAY_ENVIRONMENT_ID || '34983be2-13d3-444c-9386-fa5123eb45aa';
const serviceId = process.env.RAILWAY_SHAWQ_SERVICE_ID || process.env.RAILWAY_SERVICE_ID || '';
const token = process.env.RAILWAY_TOKEN || '';

if (!token) {
  console.error('RAILWAY_TOKEN is required');
  process.exit(1);
}
if (!serviceId) {
  console.error('RAILWAY_SHAWQ_SERVICE_ID (or RAILWAY_SERVICE_ID) is required');
  console.error('Find it in Railway → faithful-compassion → shawq-ads → Settings');
  process.exit(1);
}

const query = `mutation { serviceInstanceDeployV2(environmentId: "${environmentId}", serviceId: "${serviceId}") }`;
const res = await fetch('https://backboard.railway.com/graphql/v2', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query }),
});
const payload = await res.json();
if (!res.ok || payload.errors?.length) {
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}
console.log(`Triggered shawq-ads deploy: ${payload.data?.serviceInstanceDeployV2 || 'ok'}`);
