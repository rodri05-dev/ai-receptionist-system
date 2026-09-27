function isBusinessHours() {
  const tz = process.env.BUSINESS_TIMEZONE || 'America/New_York';
  const startHour = Number(process.env.BUSINESS_HOURS_START || 8);
  const endHour = Number(process.env.BUSINESS_HOURS_END || 18);
  const days = (process.env.BUSINESS_DAYS || 'Mon,Tue,Wed,Thu,Fri').split(',').map(d => d.trim());

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, weekday: 'short', hour: 'numeric', hour12: false
  }).formatToParts(new Date());
  const weekday = parts.find(p => p.type === 'weekday').value;
  const hour = Number(parts.find(p => p.type === 'hour').value);

  return days.includes(weekday) && hour >= startHour && hour < endHour;
}

module.exports = { isBusinessHours };