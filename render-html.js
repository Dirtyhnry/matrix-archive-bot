'use strict';

let fs = require('fs');
let path = require('path');

let crc = require('crc-32');
let { JSDOM } = require('jsdom');
let anchorme = require('anchorme').default;

let root = path.join('logs', 'json');

let rooms = fs.readdirSync(root).sort();
for (let room of rooms) {
  let roomDir = path.join('logs', 'docs', sanitizeRoomName(room));
  fs.mkdirSync(roomDir, { recursive: true });
  let days = fs
    .readdirSync(path.join(root, room))
    .filter((f) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}\.json$/.test(f))
    .map((d) => d.replace(/\.json$/, ''))
    .sort()
    .reverse();
  let alreadyDoneHtml = fs
    .readdirSync(roomDir)
    .filter((f) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}\.html$/.test(f))
    .map((d) => d.replace(/\.html$/, ''))
    .sort()
    .reverse()
    .slice(2); // always do at least the last two days

  let alreadyDone = new Set(alreadyDoneHtml);

  for (let i = 0; i < days.length; ++i) {
    let day = days[i];
    if (alreadyDone.has(day)) {
      continue;
    }
    let events = JSON.parse(fs.readFileSync(path.join(root, room, day + '.json'), 'utf8'));
    let prev = i < days.length - 1 ? days[i + 1] : null;
    let next = i > 0 ? days[i - 1] : null;
    let rendered = postprocessHTML(renderDay(rooms, room, day, events, prev, next));
    fs.writeFileSync(path.join(roomDir, day + '.html'), rendered, 'utf8');
  }

  if (days.length === 0) {
    return;
  }
  let index = `<!doctype html>
<meta http-equiv="refresh" content="0; URL='${days[0]}'" />
`;
  fs.writeFileSync(path.join(roomDir, 'index.html'), index, 'utf8');
}

if (rooms.length > 0) {
  let indexDir = path.join('logs', 'docs');
  fs.mkdirSync(indexDir, { recursive: true });
  let index = renderDay(rooms, 'index', '', [], null, null);
  fs.writeFileSync(path.join(indexDir, 'index.html'), index, 'utf8');
}

function sanitizeRoomName(room) {
  return room.replace(/ /g, '_');
}

function postprocessHTML(html) {
  // this is kind of slow, but extremely convenient
  let dom = new JSDOM(html);
  let document = dom.window.document;

  // fix up mx-reply header, pending a better solution
  for (let mx of document.querySelectorAll('mx-reply > blockquote')) {
    for (let i = 0; i < 3; ++i) {
      let a = mx.firstElementChild;
      a.remove();
    }
  }

  // replace matrix.to username links with colored spans
  let unameLinks = [...document.querySelectorAll('a')].filter((l) => l.href.startsWith('https://matrix.to/#/@'));
  for (let link of unameLinks) {
    let uname = link.textContent;
    let s = document.createElement('span');
    s.append(...link.childNodes);
    s.className = getNickClass(uname);
    link.replaceWith(s);
  }
  return dom.serialize();
}

function renderDay(rooms, room, day, events, prev, next) {
  return `<!doctype html>
<head>
  <title>${room === 'index' ? 'Matrix Logs' : `${room} on ${day}`}</title>
  <style>
  body {
    background-color: #fafafa;
  }
  .wrapper {
    display: flex;
    position: absolute;
    top: 5px;
    bottom: 10px;
    width: 100%;
  }
  .sidebar {
    flex: 0 0 165px;
    border-right: 1px solid #444;
    padding-right: 10px;
  }
  .title {
    text-align: center;
  }
  .room-list {
    border-top: 1px solid #444;
    padding-top: 2em;
    padding-left: .1em;
    margin-top: 1em;
    list-style: none;
    margin: 0px;
  }
  .room-list > li {
    margin-top: .2em;
  }
  .room-list a {
    color: #777;
    text-decoration: none;
  }
  .room-list a:hover {
    text-decoration: underline;
  }
  .current-room {
    padding-left: .5em;
    color: black !important;
    text-decoration: none;
  }
  .footer {
    position: absolute;
    bottom: 0px;
  }
  .nav > span {
    /* text-decoration gets dropped from floating elements */
    text-decoration: underline;
  }
  .log {
    overflow-y: auto;
    padding-left: 1em;
  }

  table {
    border-spacing: 0px;
  }
  td {
    padding: .12em;
  }
  a {
    color: green;
  }
  p {
    margin: 0px;
  }
  .ts {
    color: #777;
    text-decoration: none;
  }
  .ts:hover {
    text-decoration: underline;
  }
  .ts-cell {
    vertical-align:top;
  }
  .nick-cell {
    max-width: 10em;
    text-align: right;
    vertical-align:top;
  }
  .msg-cell {
    padding-left: .3em;
  }
  .highlight {
    background-color: #fffbdd;
  }


  blockquote {
    margin: 0px;
    border-left: 4px solid #ddd;
    padding-left: .3em;
  }
  .nick-1 { color: #f25e0d }
  .nick-2 { color: #e43611 }
  .nick-3 { color: #f98a11 }
  .nick-4 { color: #b4a700 }
  .nick-5 { color: #89bd3b }
  .nick-6 { color: #4ea847 }
  .nick-7 { color: #287e52 }
  .nick-8 { color: #117873 }
  .nick-9 { color: #0083a7 }
  .nick-10 { color: #2a6596 }
  .nick-11 { color: #385189 }
  .nick-12 { color: #434078 }
  .nick-13 { color: #5e4279 }
  .nick-14 { color: #7a447a }
  .nick-15 { color: #e92980 }
  .nick-16 { color: #ec273e }

  </style>
  <script>
  let firstLoad = true;
  let isMultiline = hash => /^L[0-9]+-L[0-9]+$/.test(hash);
  function highlightLinked() {
    for (let msg of document.querySelectorAll('.highlight')) {
      msg.classList.remove('highlight');
    }

    let hash = location.hash;
    if (hash.startsWith('#')) {
      hash = hash.substring(1);
    }
    if (isMultiline(hash)) {
      let parts = hash.split('-');
      if (parts.length !== 2) {
        return;
      }
      let [first, second] = parts;
      let tbody = document.getElementById('log-tbody');

      let firstIndex = -1;
      let secondIndex = -1;
      let children = tbody.children;
      for (let i = 0; i < children.length; ++i) {
        if (children[i].id === first) {
          firstIndex = i;
        } else if (children[i].id === second) {
          secondIndex = i;
        }
      }
      if (firstIndex > secondIndex) {
        [firstIndex, secondIndex] = [secondIndex, firstIndex];
      }
      for (let i = firstIndex; i <= secondIndex; ++i) {
        children[i].classList.add('highlight');
      }
      if (firstLoad) {
        children[firstIndex].scrollIntoView();
      }
    } else if (hash.length > 0) {
      let target = document.getElementById(hash);
      if (target) {
        target.classList.add('highlight');
      }
    }
    firstLoad = false;
  }

  addEventListener('DOMContentLoaded', highlightLinked);
  addEventListener('hashchange', highlightLinked);

  addEventListener('click', e => {
    if (e.target.classList.contains('ts')) {
      e.preventDefault();
      let href = e.target.href;

      if (e.shiftKey && location.hash.length > 1) {
        let hash = location.hash.substring(1);
        let firstHash;
        if (isMultiline(hash)) {
          firstHash = hash.split('-')[0];
        } else {
          firstHash = hash
        }
        let secondHash = e.target.hash.substring(1);
        let first = document.getElementById(firstHash);
        let second = document.getElementById(secondHash);
        let tbody = document.getElementById('log-tbody');
        if (first?.classList.contains('msg') && second?.classList.contains('msg')) {
          history.pushState({}, '', '#' + firstHash + '-' + secondHash);
        }
      } else {
        if (href === location.href) {
          // when clicking on currently-highlighted TS, un-highlight
          history.pushState({}, '', location.href.substring(0, location.href.indexOf('#')));
        } else {
          history.pushState({}, '', e.target.href);
        }
      }
      highlightLinked();
    }
  });
  </script>
</head>
<body><div class="wrapper">
<div class="sidebar">${renderSidebar(rooms, room, day, prev, next)}</div>
<div class="log">
${
  events.length > 0
    ? `<table><tbody id="log-tbody">
  ${events.map(renderEvent).join('\n  ')}
</tbody></table>`
    : room === 'index'
      ? '[see channel index on the left]'
      : '[no messages to display for this date]'
}
</div></div></body>
`;
}

function getNickClass(nick) {
  // we use the same logic for computing a class for the nick as whitequark: https://github.com/whitequark/irclogger/blob/d04a3e64079074c64d2b43fa79501a6d561b2b83/lib/irclogger/viewer_helpers.rb#L50-L53
  let nickClass = (crc.str(nick) % 16) + 1;
  if (nickClass <= 0) {
    nickClass += 16; // uuuuugh
  }
  return `nick-${nickClass}`;
}

function renderRoom(room, current) {
  return `<li><a href="${current === 'index' ? '' : '../'}${sanitizeRoomName(room)}/"${room === current ? ' class="current-room"' : ''}>${room}</a></li>`;
}

function renderSidebar(rooms, room, day, prev, next) {
  let header;
  if (room === 'index') {
    header = `<div class="title">Channel Index</div>`;
  } else {
    let prevInner = `<span>prev</span>`;
    let nextInner = `<span style="float:right">next</span>`;
    header = `
<div class="title">${room}<br>${day}</div>
${prev == null ? prevInner : `<a href="${prev}" class="nav">${prevInner}</a>`}
${next == null ? nextInner : `<a href="${next}" class="nav">${nextInner}</a>`}
    `;
  }

return `${header}
<ul class="room-list">
${rooms.map(r => renderRoom(r, room)).join('\n')}
</ul>
<div class="footer"><a href="https://github.com/bakkot/matrix-archive-bot">source on github</a></div>
`;
}

function renderEvent(event, index) {
  let { msgtype } = event.content;
  if (msgtype !== 'm.text' && msgtype !== 'm.emote') {
    throw new Error('unknown event message type ' + msgtype);
  }
  let id = `L${index}`;
  let date = new Date(event.ts);
  let hours = ('' + date.getUTCHours()).padStart(2, '0');
  let minutes = ('' + date.getUTCMinutes()).padStart(2, '0');
  let full = date.toString();
  let ts = `<a class="ts" href="#${id}" alt="${full}">${hours}:${minutes}</a>`;
  let { senderName } = event;
  let shortNameMatch = senderName.match(/(.*) \(@[^\):\s]+:[^\):\s]+\.[^\):\s]+\)$/);
  if (shortNameMatch != null) {
    senderName = shortNameMatch[1];
  }
  let name = `<span class="nick ${getNickClass(senderName)}" title=${escapeForHtml(event.senderId)}>${escapeForHtml(
    senderName
  )}</span>`;
  name = msgtype === 'm.text' ? `&lt;${name}&gt;` : `${name}`;
  let contents =
    event.content.format === 'org.matrix.custom.html'
      ? event.content.formatted_body
      : escapeForHtml(event.content.body);

  contents = anchorme({
    input: contents,
    options: {
      exclude: (s) => anchorme.validate.email(s) || s.startsWith('file:///'),
    },
  });
  return `<tr class="msg" id="${id}"><td class="ts-cell">${ts}</td><td class="nick-cell">${name}</td><td class="msg-cell">${contents}</td></tr>`;
}

function escapeForHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
