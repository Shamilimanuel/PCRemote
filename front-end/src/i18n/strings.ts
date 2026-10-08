/**
 * Every piece of text the app shows.
 *
 * English is the reference: it is the complete set, and the Dutch type is
 * derived from it, so a missing translation is a compile error rather than a
 * word that quietly stays in English on someone's phone.
 */

export const en = {
  // --- device list ---
  appName: 'Reveille',
  addPc: '+ Add PC',
  noPcsTitle: 'No PCs yet',
  noPcsBody: 'Tap “+ Add PC” to get started. There’s a ? there if you haven’t set the PC up yet.',
  awake: 'Awake',
  atLockScreen: 'Lock screen',
  asleep: 'Asleep',
  checking: '…',

  // --- control screen ---
  back: '‹ Back',
  backToPcs: '‹ PCs',
  edit: 'Edit',
  settings: 'Settings',
  checkNow: 'Check now',
  up: 'up',
  awayFromHome: 'away from home',

  wake: 'Wake',
  restart: 'Restart',
  sleep: 'Sleep',
  lock: 'Lock',
  shutDown: 'Shut down',
  cancel: 'Cancel',
  rebootToBios: 'Reboot to BIOS',

  sentSuffix: 'sent',
  wakeSignalSent: 'Wake-up signal sent',
  nothingPending: 'Nothing left pending',
  inMinutes: (n: number) => `in ${n} min`,

  offlineFootnote:
    'The PC isn’t answering — it’s off, asleep, or not running the agent. Only Wake will do anything until it’s back.',
  lockedFootnote:
    'The PC is on and waiting at its lock screen. Sign in on the PC and the rest of these come back.',
  onlineFootnote:
    'Wake works over your own Wi-Fi only. A powered-off PC has nothing listening for anything else.',

  // --- wake progress ---
  sendingSignal: 'Sending the signal',
  sendingSignalSub: 'Four copies, in case the router drops some.',
  wakingEllipsis: 'Waking…',
  wakingSub: 'Checking every couple of seconds. A cold start usually takes 20 to 40.',
  cameUpIn: (name: string, seconds: number) =>
    `${name} came up in ${seconds} seconds. Everything else is available now.`,
  // Used when the PC turned out to be awake long after the wake was sent --
  // usually because somebody signed in. Claiming it "came up in 340 seconds"
  // would be measuring the wrong thing.
  nowAwake: (name: string) => `${name} is awake. Everything else is available now.`,
  // A minute gone with no reply. Not a failure -- on a PC without the
  // lock-screen responder nothing *can* reply until somebody signs in.
  stillWaiting: 'Started, but not answering yet',
  stillWaitingSub:
    'Your PC is most likely sitting at the sign-in screen. Reveille can’t reach it until you sign in — it will turn green by itself when you do.',
  lockScreenTip:
    'To see “Lock screen” here instead of this, run the setup command on your PC again and say yes when it offers to answer at the lock screen.',
  noAnswerMinute: 'No answer after five minutes',
  noAnswerSub: 'The signal went out, and nothing came back.',
  mostLikely: 'Most likely, in order:',
  cause1: 'Wake-on-LAN is switched off in the PC’s BIOS or its adapter settings.',
  cause2: 'The saved MAC address doesn’t match the adapter — check the Network panel.',
  cause3: 'Your phone is on a different network from the PC.',
  dismiss: 'Dismiss',

  // --- timers ---
  shutDownWhen: (verb: string) => `${verb} when?`,
  timerHint: 'You can call it off at any point with Cancel.',
  now: 'Now',
  in15: 'In 15 minutes',
  in30: 'In 30 minutes',
  in60: 'In an hour',
  in120: 'In two hours',
  neverMind: 'Never mind',
  countdownShutdown: 'Shutting down in',
  countdownRestart: 'Restarting in',
  tapCancelToStop: '— tap Cancel to call it off',

  // --- confirmations ---
  confirmTitle: (action: string, name: string) => `${action} ${name}?`,
  confirmShutdown: 'The PC will power off in a few seconds.',
  confirmRestart: 'The PC will restart in a few seconds.',
  confirmBios:
    'The PC will restart into its BIOS settings screen. You’ll need to be at the keyboard — the phone can’t drive it from there.',
  notNow: 'Not now',
  ok: 'OK',

  // --- vitals ---
  processor: 'Processor',
  memory: 'Memory',
  disk: 'Disk',
  cores: (n: number) => `${n} cores`,
  measuring: 'measuring…',
  freeSuffix: 'free',
  ofWord: 'of',

  // --- network panel ---
  network: 'NETWORK',
  hostName: 'Host name',
  adapter: 'Adapter',
  ipAddress: 'IP address',
  port: 'Port',
  reachedVia: 'Reached via',
  homeWifi: 'Home Wi-Fi',
  away: 'Away from home',
  subnetMask: 'Subnet mask',
  wakeBroadcast: 'Wake broadcast',
  macAddress: 'MAC address',
  responseTime: 'Response time',
  biosRow: 'Reboot to BIOS',
  biosReady: 'Available',
  biosNotSetUp: 'Not set up on this PC',
  noReply: 'No reply',
  unknownUntilAwake: 'Unknown until awake',
  macMismatch: (mac: string) =>
    `This adapter’s MAC is ${mac}. Wake won’t reach the PC until you tap Edit and correct it.`,

  // --- add / edit ---
  addPcTitle: 'Add PC',
  editPcTitle: 'Edit PC',
  addHint:
    'Scan the code your PC shows, or type the values in by hand. Tap ? above if you haven’t set the PC up yet.',
  editHint: 'These came from the pairing code your PC showed. Change them only if its address moved.',
  scanCode: 'Scan code',
  name: 'Name',
  namePlaceholder: 'e.g. Office PC',
  deviceKind: 'Kind',
  kindDesktop: 'Desktop',
  kindLaptop: 'Laptop',
  kindServer: 'Server',
  kindMini: 'Mini PC',
  tokenLabel: 'Token',
  tokenPlaceholder: 'the long code from your PC',
  remoteAddress: 'Remote address (optional)',
  remoteHint:
    'Only used when the address above can’t be reached — lets shut down, sleep and lock work away from home. Leave it empty if you only use this on your own Wi-Fi.',
  testConnection: 'Test connection',
  save: 'Save',
  removeThisPc: 'Remove this PC',
  connected: 'Connected',
  connectedBody: 'Your PC answered. Tap Save to keep it.',

  // --- scanner ---
  scanTitle: 'Scan code',
  scanStarting: 'Starting the camera…',
  scanLooking: 'Looking for a code…',
  scanTypeInstead: 'Type it in instead',
  scanPermission:
    'Reveille needs the camera to read the pairing code from your PC. Nothing is recorded or sent anywhere.',
  scanPermissionBlocked:
    'Reveille needs the camera to read the pairing code, and permission was turned off. You can switch it back on in Settings.',
  allowCamera: 'Allow camera',
  openSettings: 'Open settings',

  // --- settings ---
  theme: 'Theme',
  feedback: 'Feedback',
  sound: 'Sound',
  soundHint: 'A tone for every action',
  vibration: 'Vibration',
  vibrationHint: 'Works with the volume down',
  safety: 'Safety',
  beforeShutdown: 'Before shutting down',
  beforeShutdownHint: 'Also covers restart and BIOS',
  hold: 'Hold',
  ask: 'Ask',
  off: 'Off',
  holdNote: 'Press and hold the button until it fills. Let go early and nothing happens.',
  askNote: 'A panel asks you to confirm first.',
  offNote: 'Shutdown fires the moment you tap it.',
  checkThePc: 'Check the PC',
  every: 'Every',
  everyHint: 'Less often saves battery',
  language: 'Language',
  languageHint: 'Follows your phone unless you pick one',
  systemLanguage: 'Phone',
  version: 'Version',
  checkForUpdates: 'Check for updates',
  checkingEllipsis: 'Checking…',
  upToDate: 'This is the newest version.',
  updateAvailable: (v: string) => `${v} is available.`,
  download: (v: string) => `Download ${v}`,
  alsoChecksOnOpen: 'Reveille also looks for a newer version each time you open it.',
  done: 'Done',

  // --- update banner ---
  updateBannerTitle: (v: string) => `Reveille ${v} is available`,
  updateBannerSub: 'Installs over this one — your PCs stay saved.',
  getIt: 'Get it',
  showMore: 'More',
  showLess: 'Less',

  // --- errors ---
  errNoAnswerTitle: 'No answer',
  errNoAnswerReach:
    'Your PC didn’t reply. It may be asleep, switched off, or not running the agent yet.',
  errNoAnswerAction: 'Your PC didn’t reply in time. It may have gone to sleep.',
  errUnreachableTitle: 'Can’t reach it',
  errUnreachableBody:
    'Nothing answered at that address. Check your phone is on the same Wi-Fi as the PC, and that the address is right.',
  errTokenTitle: 'Wrong token',
  errTokenBody:
    'The PC answered but refused the token. Run the pairing command again and scan the new code.',
  errRefusedTitle: 'Nothing listening',
  errRefusedBody:
    'The PC is on the network but nothing is listening on that port. The agent probably isn’t running.',
  errGenericTitle: 'That didn’t work',
  errGenericBody: 'Something went wrong.',
  errNotSetUp: 'Not set up',
  errRateLimited: 'GitHub is rate-limiting this network. Try again in a few minutes.',
  errGithubStatus: (code: number) => `GitHub replied ${code}.`,
  errNoVersion: 'Could not read this app’s version.',
  errOddRelease: 'The latest release has an odd name.',
  errNoApk: 'That release has no app file attached.',
  errTimedOut: 'GitHub did not answer in time.',
  errOffline: 'No internet connection.',

  // --- tools ---
  tools: 'MORE',
  toolMedia: 'Media',
  toolMessage: 'Message',
  toolApps: 'Apps',
  toolScreen: 'Screen',
  toolTimers: 'Timers',
  toolActivity: 'Activity',
  loading: 'Loading…',
  close: 'Close',

  // --- media ---
  mediaTitle: 'Media',
  volume: 'Volume',
  mute: 'Mute',
  unmute: 'Unmute',
  muted: 'Muted',
  playPause: 'Play or pause',
  next: 'Next',
  previous: 'Previous',
  mediaHint: 'Works with whatever is playing on the PC — Spotify, YouTube, Netflix, a game.',

  // --- message ---
  messageTitle: (name: string) => `Message to ${name}`,
  messageHint: 'It pops up in the corner of the PC’s screen.',
  messagePlaceholder: 'Type a message…',
  send: 'Send',
  messageShown: 'Shown on the PC',
  quickPhrases: ['Dinner’s ready!', 'Time for bed', 'Come here for a sec', 'Five more minutes'],

  // --- apps ---
  appsTitle: (name: string) => `Start on ${name}`,
  appsHint: 'Only what was put on the list in the Reveille window on the PC, under Apps.',
  appsEmpty:
    'Nothing on the list yet. On the PC, type reveille in PowerShell, open Apps, and add the games and programs you want to start from here.',
  appStarting: (name: string) => `${name} is starting`,

  // --- screen ---
  screenOffTitle: 'Screen viewing is off',
  screenOffBody:
    'Switch it on at the PC: type reveille in PowerShell, open Permissions, and turn on “See the screen from your phone”.',
  screenLocked: 'The PC is locked. Windows doesn’t let anything see the lock screen.',
  screenLive: 'Live',
  screenPaused: 'Paused',
  screenSharp: 'Sharp',
  screenAgo: (seconds: number) => (seconds < 2 ? 'just now' : `${seconds}s ago`),
  screenNotice: 'The PC shows a notification that you’re watching.',

  // --- timers: when finished ---
  timersTitle: 'Timers',
  whenFinishedTitle: 'When it’s finished',
  whenFinishedHint:
    'Waits until the PC has been quiet for a while — the download done, the render finished — then acts, after a minute’s warning on the PC.',
  waitFor: 'Wait for',
  waitCpu: 'Processor',
  waitNetwork: 'Downloads',
  waitBoth: 'Both',
  quietFor: 'Quiet for',
  then: 'Then',
  minutes: (n: number) => `${n} min`,
  startWatching: 'Start',
  stopWatching: 'Stop waiting',
  watchingFor: (action: string, minutes: number) => `${action} after ${minutes} quiet minutes`,
  quietSoFar: (minutes: number) => `Quiet for ${minutes} min so far`,
  stillBusy: 'Still busy',

  // --- timers: schedule ---
  scheduleTitle: 'Schedule',
  scheduleHint: 'The PC keeps these itself, so they happen even with your phone off. It warns five minutes before.',
  addSchedule: '+ Add a time',
  editSchedule: 'Change',
  deleteSchedule: 'Delete',
  skipNext: 'Skip next',
  undoSkip: 'Don’t skip',
  skipping: 'Skipping the next one',
  scheduleOff: 'Off',
  everyDay: 'Every day',
  weekdays: 'Weekdays',
  weekends: 'Weekends',
  dayNames: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  at: 'At',
  on: 'On',
  hourUp: 'Later by an hour',
  hourDown: 'Earlier by an hour',
  saved: 'Saved',

  // --- what the PC will do, on the control screen ---
  willAfterQuiet: (action: string, quiet: number, total: number) =>
    `${action} once quiet for ${total} min · ${quiet} min so far`,
  nextScheduled: (action: string, when: string) => `${action} ${when}`,
  todayAt: (time: string) => `today at ${time}`,
  tomorrowAt: (time: string) => `tomorrow at ${time}`,
  dayAt: (day: string, time: string) => `${day} at ${time}`,
  countdownSleep: 'Going to sleep in',

  // --- activity ---
  activityTitle: 'Activity',
  activityHint: 'What was done to this PC, newest first. The name is what a phone called itself; the address is where it really came from.',
  activityEmpty: 'Nothing yet.',
  activityLabels: {
    started: 'Reveille started on the PC',
    shutdown: 'Shut down',
    restart: 'Restart',
    sleep: 'Sleep',
    lock: 'Lock',
    firmware: 'Reboot to BIOS',
    cancel: 'Cancelled what was pending',
    message: 'Message',
    launch: 'Started',
    screen: 'Watched the screen',
    whenFinishedOn: '“When it’s finished” set',
    whenFinishedOff: '“When it’s finished” stopped',
    whenFinishedFired: 'Went quiet, so it acted',
    schedulesChanged: 'Schedule changed',
    scheduleFired: 'Scheduled',
    failed: 'Something failed',
  } as Record<string, string>,

  // --- vitals ---
  graphics: 'Graphics',
  gpuMemory: (used: string, total: string) => `${used} of ${total}`,

  // --- help sheet ---
  helpTitle: 'Adding your PC',
  helpStep1Title: 'Set up the PC',
  helpStep1Body:
    'On the PC you want to control, open PowerShell from the Start menu and paste this in:',
  helpStep1Aside:
    'It installs everything, sets itself to start with Windows, and finishes by opening a page with a code on it. You only ever do this once per PC.',
  helpStep2Title: 'Scan the code',
  helpStep2Body:
    'Tap Scan code and point your phone at the page on your screen. Every box below fills itself in.',
  helpStep3Title: 'Or type it in',
  helpStep3Body:
    'The same page lists everything in plain text underneath the code. If the camera won’t cooperate, copy those five values into the boxes by hand.',
  helpGotchas: 'Two things that catch people out',
  helpWifiLead: 'Both devices need the same Wi-Fi.',
  helpWifiBody:
    ' This works on your home network, not over mobile data. That’s deliberate — nothing is exposed to the internet.',
  helpTokenLead: 'The token is a password.',
  helpTokenBody:
    ' Anyone on your network who has it can switch the PC off. Don’t share the page it’s printed on.',
};

export type Strings = typeof en;

export const nl: Strings = {
  appName: 'Reveille',
  addPc: '+ Pc toevoegen',
  noPcsTitle: 'Nog geen pc’s',
  noPcsBody:
    'Tik op “+ Pc toevoegen” om te beginnen. Daar staat een ? als je de pc nog niet hebt ingesteld.',
  awake: 'Wakker',
  atLockScreen: 'Vergrendelscherm',
  asleep: 'Slaapt',
  checking: '…',

  back: '‹ Terug',
  backToPcs: '‹ Pc’s',
  edit: 'Bewerken',
  settings: 'Instellingen',
  checkNow: 'Nu controleren',
  up: 'aan',
  awayFromHome: 'niet thuis',

  wake: 'Wekken',
  restart: 'Herstarten',
  sleep: 'Slaapstand',
  lock: 'Vergrendelen',
  shutDown: 'Afsluiten',
  cancel: 'Annuleren',
  rebootToBios: 'Naar BIOS',

  sentSuffix: 'verstuurd',
  wakeSignalSent: 'Weksignaal verstuurd',
  nothingPending: 'Niets meer gepland',
  inMinutes: (n: number) => `over ${n} min`,

  offlineFootnote:
    'De pc antwoordt niet — hij staat uit, slaapt, of draait de agent niet. Alleen Wekken doet iets tot hij terug is.',
  lockedFootnote:
    'De pc staat aan en wacht op het vergrendelscherm. Meld je aan op de pc, dan werken de rest weer.',
  onlineFootnote:
    'Wekken werkt alleen op je eigen wifi. Een uitgeschakelde pc luistert nergens anders naar.',

  sendingSignal: 'Signaal versturen',
  sendingSignalSub: 'Vier kopieën, voor het geval de router er een laat vallen.',
  wakingEllipsis: 'Wakker maken…',
  wakingSub: 'Elke paar seconden een controle. Koud opstarten duurt meestal 20 tot 40 seconden.',
  cameUpIn: (name: string, seconds: number) =>
    `${name} was er in ${seconds} seconden. De rest werkt nu ook.`,
  nowAwake: (name: string) => `${name} is wakker. De rest werkt nu ook.`,
  stillWaiting: 'Gestart, maar nog geen antwoord',
  stillWaitingSub:
    'Je pc staat waarschijnlijk op het aanmeldscherm. Reveille kan hem niet bereiken tot je inlogt — daarna wordt hij automatisch groen.',
  lockScreenTip:
    'Wil je hier “Vergrendeld” zien in plaats van dit? Voer het setup-commando op je pc nog eens uit en zeg ja als hij aanbiedt om op het vergrendelscherm te antwoorden.',
  noAnswerMinute: 'Geen antwoord na vijf minuten',
  noAnswerSub: 'Het signaal is verstuurd en er kwam niets terug.',
  mostLikely: 'Meest waarschijnlijk, op volgorde:',
  cause1: 'Wake-on-LAN staat uit in de BIOS van de pc of bij de netwerkadapter.',
  cause2: 'Het opgeslagen MAC-adres past niet bij de adapter — kijk bij Netwerk.',
  cause3: 'Je telefoon zit op een ander netwerk dan de pc.',
  dismiss: 'Sluiten',

  shutDownWhen: (verb: string) => `${verb} wanneer?`,
  timerHint: 'Je kunt het altijd afbreken met Annuleren.',
  now: 'Nu',
  in15: 'Over 15 minuten',
  in30: 'Over 30 minuten',
  in60: 'Over een uur',
  in120: 'Over twee uur',
  neverMind: 'Toch niet',
  countdownShutdown: 'Sluit af over',
  countdownRestart: 'Herstart over',
  tapCancelToStop: '— tik op Annuleren om het af te breken',

  confirmTitle: (action: string, name: string) => `${action}: ${name}?`,
  confirmShutdown: 'De pc gaat over een paar seconden uit.',
  confirmRestart: 'De pc herstart over een paar seconden.',
  confirmBios:
    'De pc herstart naar het BIOS-scherm. Je moet dan zelf achter het toetsenbord zitten — de telefoon kan daar niets meer.',
  notNow: 'Nu niet',
  ok: 'Oké',

  processor: 'Processor',
  memory: 'Geheugen',
  disk: 'Schijf',
  cores: (n: number) => `${n} kernen`,
  measuring: 'meten…',
  freeSuffix: 'vrij',
  ofWord: 'van',

  network: 'NETWERK',
  hostName: 'Computernaam',
  adapter: 'Adapter',
  ipAddress: 'IP-adres',
  port: 'Poort',
  reachedVia: 'Bereikt via',
  homeWifi: 'Wifi thuis',
  away: 'Van buitenaf',
  subnetMask: 'Subnetmasker',
  wakeBroadcast: 'Wekadres',
  macAddress: 'MAC-adres',
  responseTime: 'Reactietijd',
  biosRow: 'Naar BIOS',
  biosReady: 'Beschikbaar',
  biosNotSetUp: 'Niet ingesteld op deze pc',
  noReply: 'Geen antwoord',
  unknownUntilAwake: 'Pas bekend als hij wakker is',
  macMismatch: (mac: string) =>
    `Het MAC-adres van deze adapter is ${mac}. Wekken werkt pas als je dat via Bewerken aanpast.`,

  addPcTitle: 'Pc toevoegen',
  editPcTitle: 'Pc bewerken',
  addHint:
    'Scan de code die je pc laat zien, of typ de waarden zelf in. Tik hierboven op ? als je de pc nog niet hebt ingesteld.',
  editHint:
    'Deze komen uit de koppelcode van je pc. Pas ze alleen aan als zijn adres is veranderd.',
  scanCode: 'Code scannen',
  name: 'Naam',
  namePlaceholder: 'bijv. Werkkamer',
  deviceKind: 'Soort',
  kindDesktop: 'Desktop',
  kindLaptop: 'Laptop',
  kindServer: 'Server',
  kindMini: 'Mini-pc',
  tokenLabel: 'Token',
  tokenPlaceholder: 'de lange code van je pc',
  remoteAddress: 'Adres van buitenaf (optioneel)',
  remoteHint:
    'Wordt alleen gebruikt als het adres hierboven niet bereikbaar is — dan werken afsluiten, slaapstand en vergrendelen ook onderweg. Laat leeg als je dit alleen thuis gebruikt.',
  testConnection: 'Verbinding testen',
  save: 'Opslaan',
  removeThisPc: 'Deze pc verwijderen',
  connected: 'Verbonden',
  connectedBody: 'Je pc antwoordde. Tik op Opslaan om hem te bewaren.',

  scanTitle: 'Code scannen',
  scanStarting: 'Camera starten…',
  scanLooking: 'Zoeken naar een code…',
  scanTypeInstead: 'Liever zelf typen',
  scanPermission:
    'Reveille heeft de camera nodig om de koppelcode van je pc te lezen. Er wordt niets opgenomen of verstuurd.',
  scanPermissionBlocked:
    'Reveille heeft de camera nodig voor de koppelcode, maar die toestemming staat uit. Je kunt hem weer aanzetten in Instellingen.',
  allowCamera: 'Camera toestaan',
  openSettings: 'Instellingen openen',

  theme: 'Thema',
  feedback: 'Terugkoppeling',
  sound: 'Geluid',
  soundHint: 'Een toon bij elke actie',
  vibration: 'Trillen',
  vibrationHint: 'Werkt ook met het geluid uit',
  safety: 'Zekerheid',
  beforeShutdown: 'Voor het afsluiten',
  beforeShutdownHint: 'Geldt ook voor herstarten en BIOS',
  hold: 'Vasthouden',
  ask: 'Vragen',
  off: 'Uit',
  holdNote: 'Houd de knop ingedrukt tot hij vol is. Laat je eerder los, dan gebeurt er niets.',
  askNote: 'Er verschijnt eerst een vraag om te bevestigen.',
  offNote: 'Afsluiten gebeurt meteen bij één tik.',
  checkThePc: 'Pc controleren',
  every: 'Elke',
  everyHint: 'Minder vaak spaart de accu',
  language: 'Taal',
  languageHint: 'Volgt je telefoon tenzij je zelf kiest',
  systemLanguage: 'Telefoon',
  version: 'Versie',
  checkForUpdates: 'Controleer op updates',
  checkingEllipsis: 'Bezig…',
  upToDate: 'Dit is de nieuwste versie.',
  updateAvailable: (v: string) => `${v} is beschikbaar.`,
  download: (v: string) => `${v} downloaden`,
  alsoChecksOnOpen: 'Reveille kijkt ook bij elke start of er een nieuwere versie is.',
  done: 'Klaar',

  updateBannerTitle: (v: string) => `Reveille ${v} is beschikbaar`,
  updateBannerSub: 'Installeert over deze heen — je pc’s blijven bewaard.',
  getIt: 'Ophalen',
  showMore: 'Meer',
  showLess: 'Minder',

  errNoAnswerTitle: 'Geen antwoord',
  errNoAnswerReach:
    'Je pc antwoordde niet. Misschien slaapt hij, staat hij uit, of draait de agent nog niet.',
  errNoAnswerAction: 'Je pc antwoordde niet op tijd. Misschien is hij in slaapstand gegaan.',
  errUnreachableTitle: 'Niet te bereiken',
  errUnreachableBody:
    'Op dat adres antwoordde niets. Controleer of je telefoon op dezelfde wifi zit als de pc, en of het adres klopt.',
  errTokenTitle: 'Verkeerde token',
  errTokenBody:
    'De pc antwoordde wel, maar weigerde de token. Voer het koppelcommando opnieuw uit en scan de nieuwe code.',
  errRefusedTitle: 'Niets luistert',
  errRefusedBody:
    'De pc is op het netwerk, maar op die poort luistert niets. Waarschijnlijk draait de agent niet.',
  errGenericTitle: 'Dat lukte niet',
  errGenericBody: 'Er ging iets mis.',
  errNotSetUp: 'Niet ingesteld',
  errRateLimited: 'GitHub beperkt dit netwerk tijdelijk. Probeer het over een paar minuten opnieuw.',
  errGithubStatus: (code: number) => `GitHub antwoordde ${code}.`,
  errNoVersion: 'Kon de versie van deze app niet lezen.',
  errOddRelease: 'De nieuwste release heeft een rare naam.',
  errNoApk: 'Bij die release zit geen app-bestand.',
  errTimedOut: 'GitHub antwoordde niet op tijd.',
  errOffline: 'Geen internetverbinding.',

  tools: 'MEER',
  toolMedia: 'Media',
  toolMessage: 'Bericht',
  toolApps: 'Apps',
  toolScreen: 'Scherm',
  toolTimers: 'Timers',
  toolActivity: 'Activiteit',
  loading: 'Laden…',
  close: 'Sluiten',

  mediaTitle: 'Media',
  volume: 'Volume',
  mute: 'Dempen',
  unmute: 'Geluid aan',
  muted: 'Gedempt',
  playPause: 'Afspelen of pauzeren',
  next: 'Volgende',
  previous: 'Vorige',
  mediaHint: 'Werkt met wat er op de pc speelt — Spotify, YouTube, Netflix, een game.',

  messageTitle: (name: string) => `Bericht aan ${name}`,
  messageHint: 'Het verschijnt in de hoek van het scherm van de pc.',
  messagePlaceholder: 'Typ een bericht…',
  send: 'Versturen',
  messageShown: 'Getoond op de pc',
  quickPhrases: ['Eten is klaar!', 'Tijd om te slapen', 'Kom even hier', 'Nog vijf minuten'],

  appsTitle: (name: string) => `Starten op ${name}`,
  appsHint: 'Alleen wat in het Reveille-venster op de pc op de lijst is gezet, onder Apps.',
  appsEmpty:
    'Nog niets op de lijst. Typ op de pc reveille in PowerShell, open Apps, en voeg de games en programma’s toe die je hiervandaan wilt starten.',
  appStarting: (name: string) => `${name} wordt gestart`,

  screenOffTitle: 'Scherm bekijken staat uit',
  screenOffBody:
    'Zet het aan op de pc: typ reveille in PowerShell, open Toestemmingen en zet “Het scherm zien op je telefoon” aan.',
  screenLocked: 'De pc is vergrendeld. Windows laat niets het vergrendelscherm zien.',
  screenLive: 'Live',
  screenPaused: 'Gepauzeerd',
  screenSharp: 'Scherp',
  screenAgo: (seconds: number) => (seconds < 2 ? 'zojuist' : `${seconds}s geleden`),
  screenNotice: 'De pc laat een melding zien dat je meekijkt.',

  timersTitle: 'Timers',
  whenFinishedTitle: 'Als het klaar is',
  whenFinishedHint:
    'Wacht tot de pc een tijdje rustig is — de download klaar, het renderen af — en doet het dan, na een minuut waarschuwing op de pc.',
  waitFor: 'Wacht op',
  waitCpu: 'Processor',
  waitNetwork: 'Downloads',
  waitBoth: 'Allebei',
  quietFor: 'Rustig voor',
  then: 'Dan',
  minutes: (n: number) => `${n} min`,
  startWatching: 'Starten',
  stopWatching: 'Niet meer wachten',
  watchingFor: (action: string, minutes: number) => `${action} na ${minutes} rustige minuten`,
  quietSoFar: (minutes: number) => `Tot nu toe ${minutes} min rustig`,
  stillBusy: 'Nog bezig',

  scheduleTitle: 'Planning',
  scheduleHint: 'De pc houdt deze zelf bij, dus ze gebeuren ook als je telefoon uit staat. Hij waarschuwt vijf minuten van tevoren.',
  addSchedule: '+ Tijd toevoegen',
  editSchedule: 'Wijzigen',
  deleteSchedule: 'Verwijderen',
  skipNext: 'Volgende overslaan',
  undoSkip: 'Toch niet overslaan',
  skipping: 'De volgende wordt overgeslagen',
  scheduleOff: 'Uit',
  everyDay: 'Elke dag',
  weekdays: 'Doordeweeks',
  weekends: 'Weekend',
  dayNames: ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'],
  at: 'Om',
  on: 'Op',
  hourUp: 'Een uur later',
  hourDown: 'Een uur eerder',
  saved: 'Opgeslagen',

  willAfterQuiet: (action: string, quiet: number, total: number) =>
    `${action} na ${total} min rust · tot nu toe ${quiet} min`,
  nextScheduled: (action: string, when: string) => `${action} ${when}`,
  todayAt: (time: string) => `vandaag om ${time}`,
  tomorrowAt: (time: string) => `morgen om ${time}`,
  dayAt: (day: string, time: string) => `${day} om ${time}`,
  countdownSleep: 'Slaapstand over',

  activityTitle: 'Activiteit',
  activityHint: 'Wat er met deze pc is gedaan, nieuwste eerst. De naam is hoe een telefoon zichzelf noemde; het adres is waar het echt vandaan kwam.',
  activityEmpty: 'Nog niets.',
  activityLabels: {
    started: 'Reveille gestart op de pc',
    shutdown: 'Afgesloten',
    restart: 'Herstart',
    sleep: 'Slaapstand',
    lock: 'Vergrendeld',
    firmware: 'Naar BIOS',
    cancel: 'Gepland afgebroken',
    message: 'Bericht',
    launch: 'Gestart',
    screen: 'Scherm bekeken',
    whenFinishedOn: '“Als het klaar is” ingesteld',
    whenFinishedOff: '“Als het klaar is” gestopt',
    whenFinishedFired: 'Werd rustig, dus deed het',
    schedulesChanged: 'Planning gewijzigd',
    scheduleFired: 'Gepland',
    failed: 'Er ging iets mis',
  } as Record<string, string>,

  graphics: 'Grafisch',
  gpuMemory: (used: string, total: string) => `${used} van ${total}`,

  helpTitle: 'Je pc toevoegen',
  helpStep1Title: 'De pc instellen',
  helpStep1Body:
    'Open op de pc die je wilt bedienen PowerShell via het startmenu en plak dit erin:',
  helpStep1Aside:
    'Dit installeert alles, zorgt dat het met Windows meestart, en opent tot slot een pagina met een code. Dit doe je één keer per pc.',
  helpStep2Title: 'De code scannen',
  helpStep2Body:
    'Tik op Code scannen en richt je telefoon op de pagina op je scherm. Alle velden hieronder vullen zichzelf.',
  helpStep3Title: 'Of typ het zelf',
  helpStep3Body:
    'Op diezelfde pagina staat alles ook als gewone tekst onder de code. Werkt de camera niet mee, neem die vijf waarden dan zelf over.',
  helpGotchas: 'Twee dingen waar mensen op stuklopen',
  helpWifiLead: 'Beide apparaten moeten op dezelfde wifi zitten.',
  helpWifiBody:
    ' Dit werkt op je thuisnetwerk, niet via mobiel internet. Dat is met opzet — er staat niets open naar het internet.',
  helpTokenLead: 'De token is een wachtwoord.',
  helpTokenBody:
    ' Iedereen op je netwerk die hem heeft, kan de pc uitzetten. Deel de pagina waar hij op staat dus niet.',
};
