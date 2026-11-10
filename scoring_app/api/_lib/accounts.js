// Player accounts are on for a site only when PLAYER_ACCOUNTS=on (owner 2026-11-10: the live site stays guest-only
// until it can send e-mail). Off, the routers refuse every account, friends and games call, and the page opens
// casual play as a guest (it asks GET /api/account/config).
function accountsOn() {
  return process.env.PLAYER_ACCOUNTS === 'on';
}

function refuseWhenOff(res) {
  if (accountsOn()) return false;
  res.status(404).json({ code: 'accounts_off', error: 'Player accounts are not open on this site yet.' });
  return true;
}

module.exports = { accountsOn, refuseWhenOff };
