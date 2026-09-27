function scoreLead(data = {}) {
  let score = 0;
  if (data.serviceInterest) score += 20;
  if (data.email) score += 15;
  if (data.phone) score += 15;
  if (data.urgent === true) score += 25; // "my basement is flooding right now" energy
  if (data.address || data.zipCode) score += 10;
  if (data.fullName || data.attendeeName) score += 15;
  return Math.min(score, 100);
}

module.exports = { scoreLead };