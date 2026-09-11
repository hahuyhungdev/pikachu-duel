/**
 * The lobby panel: seats, invite link, host controls and the connection pill.
 * Presentation only — it reads the room state and never mutates it.
 */

import { inviteLink } from '../net/config.js';

const LINK_TEXT = {
  open: 'Connected',
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  dropped: 'Connection lost — retrying',
  error: 'Connection error',
  unconfigured: 'No relay configured',
};

export function createLobbyView({ dom, getNet }) {
  const connectedCount = (net) => (net?.players ?? []).filter((p) => p.connected).length;
  const isHost = (net) => Boolean(net && net.you && net.you === net.hostId);

  function note(text) {
    dom.onlineNote.textContent = text ?? '';
    dom.onlineNote.hidden = !text;
  }

  function showMode(mode) {
    for (const button of dom.modeButtons) {
      button.setAttribute('aria-selected', String(button.dataset.modeBtn === mode));
    }
    dom.startForm.hidden = mode === 'online';
    dom.onlineForm.hidden = mode !== 'online';
    if (dom.fieldP2) {
      dom.fieldP2.hidden = mode === 'solo';
    }
    if (dom.p1Label) {
      dom.p1Label.textContent = mode === 'solo' ? 'Your name' : 'Player 1 name';
    }
    if (dom.startSubmit) {
      dom.startSubmit.textContent = mode === 'solo' ? 'Start solo game' : 'Start duel';
    }
    if (dom.rulesGoal) {
      dom.rulesGoal.textContent = mode === 'solo'
        ? 'Clear the board before the clock runs out.'
        : 'Clear the mirrored grid before your rival.';
    }
    note('');
  }

  function seatRow(net, slot) {
    const player = (net?.players ?? []).find((p) => p.slot === slot);
    const row = document.createElement('li');
    row.className = 'seat';
    row.dataset.slot = String(slot);

    if (!player) {
      row.dataset.empty = 'true';
      row.textContent = slot === 1 ? 'Waiting for the host…' : 'Waiting for a second player…';
      return row;
    }

    const label = document.createElement('span');
    label.textContent = `P${slot} · ${player.name}`;
    row.append(label);

    const tags = [
      player.id === net.you ? 'you' : null,
      player.host ? 'host' : null,
      player.connected ? null : 'offline',
    ].filter(Boolean);

    for (const text of tags) {
      const tag = document.createElement('span');
      tag.className = 'seat__tag';
      tag.textContent = text;
      row.append(tag);
    }
    return row;
  }

  function statusLine(net) {
    if (net.link !== 'open') {
      return net.link === 'unconfigured'
        ? 'No relay is configured for this page yet.'
        : 'Connecting to the relay…';
    }
    if (net.status === 'playing') return 'A duel is already running — you will be in the next round.';
    if (connectedCount(net) < 2) {
      return 'Send the link above to your opponent. The duel starts when both of you are here.';
    }
    return isHost(net)
      ? 'Both players are here. Pick a board and start.'
      : 'Both players are here. Waiting for the host to start.';
  }

  function render() {
    const net = getNet();
    if (!net) return;
    dom.lobbyCode.textContent = net.code;
    dom.inviteLink.value = inviteLink(net.code);
    dom.lobbySeats.replaceChildren(seatRow(net, 1), seatRow(net, 2));

    dom.lobbySettings.hidden = !isHost(net);
    dom.lobbyDifficulty.value = net.settings.difficulty;
    dom.lobbyClock.value = String(net.settings.clock);
    dom.hostStart.disabled = !isHost(net) || connectedCount(net) < 2;
    dom.lobbyStatus.textContent = statusLine(net);
  }

  function setLinkStatus({ state }) {
    const net = getNet();
    if (!net) return;
    dom.linkState.hidden = false;
    dom.linkState.dataset.ok = String(state === 'open');
    dom.linkState.textContent = state === 'open' ? `Room ${net.code}` : LINK_TEXT[state] ?? state;
    render();
  }

  return { note, showMode, render, setLinkStatus };
}
