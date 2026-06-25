# Tutorial content

`scenes.js` contains Sarge's editable room-by-room dialogue.

The tutorial floor assigns these lesson IDs:

- `start`
- `training`
- `treasure`
- `shop`
- `forge`
- `challenge`
- `ladder`

Dialogue uses the game's blocking cutscene system. Keep each line short enough to
read comfortably on mobile. Tutorial sequencing and spotlight behavior live in
`js/ui/tutorial-controller.js`; deterministic room setup lives in
`js/game/rooms.js`.
