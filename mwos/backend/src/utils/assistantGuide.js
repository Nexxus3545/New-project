'use strict';

// Reference questions are the entire training corpus. Incoming questions are
// scored in memory and never added to the corpus or looked up in a patient chart.
const topics = [
  {
    id: 'scheduling', label: 'Open consultation schedules', links: ['/my/scheduling', '/scheduling'],
    examples: ['book an appointment', 'request a consultation', 'clinic schedule', 'available doctor', 'find a time slot',
      'approve appointment requests', 'magpa checkup', 'magpa appointment', 'iskedyul ng doktor', 'magpatingin sa midwife'],
    answers: [
      ['Open Consultation schedules, select a date and an available time slot, then submit your request. You can follow its approval under Consultation requests.',
        'Sa Consultation schedules, pumili ng petsa at bakanteng oras, saka isumite ang request. Makikita sa Consultation requests kung aprubado na.'],
      ['Open Consultation schedules and select a date to see doctor availability. Doctors and administrators can also review requests there.',
        'Sa Consultation schedules, pumili ng petsa para makita ang oras ng mga doktor. Makikita rin ng doktor at administrator doon ang mga request na rerepasuhin.'],
    ],
  },
  {
    id: 'messages', label: 'Open secure messages', links: ['/my/messages', '/messages'],
    examples: ['message the clinic', 'send a secure message', 'contact my care team', 'reply to a conversation', 'chat with staff',
      'inbox', 'send a follow up question', 'magpadala ng mensahe', 'mensahe sa nurse', 'kausapin ang klinika', 'magtanong sa doktor', 'mag chat'],
    answers: [['Open Messages and choose a conversation to reply, or start a new one for a non-urgent question.',
      'Buksan ang Messages at pumili ng usapan para sumagot, o magsimula ng bagong mensahe para sa tanong na puwedeng maghintay.']],
  },
  {
    id: 'telehealth', label: 'Open telehealth', links: ['/my/telehealth', '/telehealth'],
    examples: ['telehealth', 'join the video call', 'camera and microphone', 'video consultation', 'online consultation',
      'where is my meeting room', 'sumali sa tawag', 'konsultasyon online', 'buksan ang camera'],
    answers: [['Open Telehealth and select the consultation. Its details show the schedule, clinic updates and video controls for that session.',
      'Buksan ang Telehealth at piliin ang konsultasyon. Makikita sa detalye nito ang iskedyul, mga update, at video controls ng session.']],
  },
  {
    id: 'records', label: 'Open health records', links: ['/my/health-records', '/medical-records'],
    examples: ['health records', 'medical records', 'review lab results', 'view ultrasound report', 'where are my prescriptions',
      'my saved medical documents', 'resulta ng laboratoryo', 'tingnan ang reseta', 'hanapin ang rekord'],
    answers: [
      ['Open Health Records to review your saved results and documents. Ask the care team through Messages if you need help understanding a result.',
        'Sa Health Records, makikita ang mga naka-save mong resulta at dokumento. Magtanong sa care team sa Messages kung kailangan ng paliwanag.'],
      ['Open Medical Records and select the patient to review the entries your role can access.',
        'Buksan ang Medical Records at piliin ang pasyente para makita ang mga rekord na saklaw ng iyong tungkulin.'],
    ],
  },
  {
    id: 'birth-plan', label: 'Open birth plan', links: ['/my/birth-plan', '/labor-delivery'],
    examples: ['birth plan', 'birthing preferences', 'delivery plan', 'labor plan', 'choose my birth companion',
      'plano sa panganganak', 'kasama sa panganganak', 'birth plan preferences'],
    answers: [
      ['In My Birth Plan, choose “Create or update my plan” for an active pregnancy. Save your preferences and questions for clinic review.',
        'Sa My Birth Plan, piliin ang “Create or update my plan” para sa aktibong pregnancy record. I-save ang iyong kagustuhan at mga tanong para sa clinic review.'],
      ['In Labor & Delivery, select the patient and open the Birth plan section to review their saved preferences.',
        'Sa Labor & Delivery, piliin ang pasyente at tingnan ang Birth plan para sa mga naka-save na kagustuhan.'],
    ],
  },
  {
    id: 'education', label: 'Open health education', links: ['/my/health-tips', '/health-education'],
    examples: ['health tips', 'health education', 'prenatal education', 'postnatal tips', 'newborn care articles', 'breastfeeding articles',
      'clinic learning materials', 'nutrition resources', 'babasahin tungkol sa pagbubuntis', 'gabay sa pagpapasuso'],
    answers: [['Open Health Education to browse the materials shared by the clinic. For advice about an individual situation, contact the care team.',
      'Buksan ang health education materials na ibinahagi ng klinika. Para sa payong angkop sa isang pasyente, kausapin ang care team.']],
  },
  {
    id: 'notifications', label: 'Open clinic updates', links: ['/my/notifications', null],
    examples: ['notification bell', 'unread notifications', 'clinic reminders', 'where are my alerts', 'new updates',
      'mga abiso', 'paano makita ang paalala', 'may bagong notification'],
    answers: [['Select the notification bell to see unread messages and clinic updates. Select an item to open it.',
      'Pindutin ang bell para makita ang mga bagong mensahe at abiso ng klinika. Piliin ang item para mabuksan ito.']],
  },
  {
    id: 'account', label: 'Open account settings', links: ['/my/settings', '/settings'],
    examples: ['account settings', 'change my password', 'update sign in email', 'profile photo', 'upload my ID', 'credential verification',
      'palitan ang password', 'ayusin ang profile', 'magpasa ng id', 'baguhin ang email'],
    answers: [['Select Account settings at the bottom of the sidebar. Use Profile for personal details, or Settings for sign-in, credentials and appearance.',
      'Piliin ang Account settings sa ibaba ng sidebar. Buksan ang Profile para sa personal na detalye, o Settings para sa sign-in, credentials at itsura ng portal.']],
  },
];

const stopWords = new Set(('how what where when do can am are is i me my the a an and to it for of in on with at ' +
  'please show open find see tell want need does you your mwos ' +
  'ang kung ko po paano pano saan nasaan kailan ano ba iyong ito iyon rin din mga ng nang na sa may ako ay yung').split(' '));

function tokens(text) {
  const words = text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]+/g) || [];
  return [...new Set(words.filter(word => !stopWords.has(word)).map(word =>
    word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word))];
}

// Classify by nearest labelled example using TF-IDF cosine similarity. Estimate
// IDF from reference questions only; an unseen word lowers the match score.
const corpus = topics.flatMap(topic => topic.examples.map(example => ({ topic, words: tokens(example) })));
const documentFrequency = new Map();
for (const { words } of corpus) {
  for (const word of words) documentFrequency.set(word, (documentFrequency.get(word) || 0) + 1);
}
function weight(word) {
  return 1 + Math.log((1 + corpus.length) / (1 + (documentFrequency.get(word) || 0)));
}
const squaredWeight = word => weight(word) ** 2;
const norm = words => Math.sqrt(words.reduce((sum, word) => sum + squaredWeight(word), 0));
const examples = corpus.map(({ topic, words }) => ({ topic, words, norm: norm(words) }));

function predict(question) {
  const words = tokens(question);
  const wordSet = new Set(words);
  const length = norm(words);
  if (!length) return null;
  const scores = new Map();
  for (const example of examples) {
    const dot = example.words.reduce((sum, word) => sum + (wordSet.has(word) ? squaredWeight(word) : 0), 0);
    const similarity = dot / (length * example.norm);
    scores.set(example.topic, Math.max(scores.get(example.topic) || 0, similarity));
  }
  const [best, second] = [...scores].sort((a, b) => b[1] - a[1]);
  return best[1] >= 0.33 && best[1] - second[1] >= 0.055 ? best[0] : null;
}

const filipino = /\b(ako|ang|ano|ba|baguhin|buksan|gamot|hindi|iskedyul|kausapin|ko|lang|mga|may|mensahe|na|nasaan|ng|paano|pano|po|sa|saan|tingnan|mag[a-z]+)\b/i;
const urgent = /\b(severe|bleed(?:ing)?|unconscious|chest pain|cannot breathe|can.?t breathe|difficulty breathing|trouble breathing|emergency|suicid\w*|harm myself|kill myself|seizure|pagdurugo|dumudugo|dinudugo|nahihirapan(?:g)? (?:akong |siyang |siya |ako )?huminga|hirap (?:akong |siyang |sa pag)?h?uminga|hindi (?:ako |siya )?makahinga|walang malay|nangingisay|magpakamatay)\b/i;
const clinical = /\b(diagnos\w*|symptoms?|treat(?:ment)?|cure|dos(?:e|age)|prescribe|should i take|can i take|do i have|am i pregnant|what.{0,25}medicine|is .{0,38}(?:normal|dangerous|safe)|ano.{0,30}(?:sakit|gamot)|gamot (?:sa|para)|anong (?:sakit|gamot)|masakit|lagnat|sintomas|buntis ba|normal ba|inumin|iinumin|gamutin)\b/i;

function isBriefFollowUp(question) {
  // Use the raw word count here.  The follow-up phrases deliberately consist
  // mostly of stop words (for example, "How do I open it?") and therefore may
  // have no useful classification tokens at all.
  const words = question.match(/[a-z0-9]+/gi) || [];
  return words.length > 0 && words.length <= 7 && /\b(how|where|what|can|open|more|details|help|paano|pano|saan|ano|ito|iyon|pwede|puwede)\b/i.test(question);
}

function guideReply(question, role, previousTopic = null) {
  const language = filipino.test(question) ? 1 : 0;
  const disclaimer = ['For personal medical advice, speak with your care team.', 'Para sa payong medikal na angkop sa iyo, makipag-usap sa iyong care team.'][language];
  const portal = role === 'patient' ? 0 : 1;
  const result = (topic, answer, route = null, label = null) => ({ topic, answer, route, label: route ? label : null, disclaimer });
  if (urgent.test(question)) {
    return result('emergency', [
      'Call local emergency services or go to the nearest emergency department now. Please do not wait for a chat reply or an online appointment.',
      'Tumawag agad sa lokal na serbisyong pang-emergency o pumunta sa pinakamalapit na emergency department. Huwag hintayin ang sagot sa chat o oras ng appointment.',
    ][language], ['/my/emergency', '/emergency-map'][portal], 'Open emergency support');
  }
  if (clinical.test(question)) {
    return result('medical-question', [
      'A clinician can assess symptoms and advise about medicines. Use Messages to ask your care team or request a consultation through Scheduling.',
      'Makipag-usap sa isang propesyonal sa kalusugan para masuri ang sintomas o gamot. Maaari kang magtanong sa care team sa Messages o humiling ng konsultasyon sa Scheduling.',
    ][language], ['/my/messages', '/messages'][portal], 'Open secure messages');
  }
  const topic = predict(question) || (isBriefFollowUp(question) ? topics.find((item) => item.id === previousTopic) : null);
  if (!topic) {
    return result('clarify', [
      'Which part of MWOS do you need help with? For example, ask how to book an appointment, message the clinic, join a video call or find a lab result.',
      'Aling bahagi ng MWOS ang kailangan mo? Puwede kang magtanong kung paano magpa-appointment, mag-message sa klinika, sumali sa video call o hanapin ang resulta ng laboratoryo.',
    ][language]);
  }
  return result(topic.id, (topic.answers[portal] || topic.answers[0])[language], topic.links[portal], topic.label);
}

module.exports = { guideReply };
