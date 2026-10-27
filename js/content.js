// Static content: occupations, life roles, burdens, prayer prompts, group types.

export const OCCUPATIONS = `Accountant|Actor|Actuary|Administrative Assistant|Air Traffic Controller|Aircraft Mechanic|Architect|Artist|Athlete|Athletic Trainer|Attorney|Auditor|Author|Baker|Bank Teller|Banker|Barber|Barista|Bartender|Biologist|Bookkeeper|Bus Driver|Business Owner|Butcher|Caregiver|Carpenter|Cashier|Chaplain|Chef|Chemist|Childcare Worker|Chiropractor|Civil Engineer|Cleaner|Coach|College Professor|Computer Programmer|Construction Worker|Consultant|Correctional Officer|Cosmetologist|Counselor|Customer Service Representative|Data Analyst|Delivery Driver|Dental Assistant|Dental Hygienist|Dentist|Designer|Dietitian|Dispatcher|Doctor|Electrician|Elementary School Teacher|EMT / Paramedic|Engineer|Entrepreneur|Esthetician|Event Planner|Factory Worker|Farmer|Financial Advisor|Firefighter|Fisherman|Flight Attendant|Florist|Food Service Worker|Funeral Director|Game Developer|Gardener|Graphic Designer|Hairstylist|Health Aide|Heavy Equipment Operator|High School Teacher|Homemaker|Hospice Worker|Hotel Worker|HR Manager|HVAC Technician|Insurance Agent|Interior Designer|IT Specialist|Janitor|Journalist|Judge|Laboratory Technician|Landscaper|Lawyer|Librarian|Lineman|Loan Officer|Machinist|Mail Carrier|Maintenance Worker|Manager|Marketing Professional|Massage Therapist|Mechanic|Medical Assistant|Military Service Member|Miner|Minister|Missionary|Musician|Nanny|Nurse|Nurse Practitioner|Nursing Assistant|Nutritionist|Occupational Therapist|Office Manager|Optometrist|Painter|Paralegal|Pastor|Pharmacist|Pharmacy Technician|Photographer|Physical Therapist|Physician|Physician Assistant|Pilot|Plumber|Police Officer|Politician|Postal Worker|Principal|Product Manager|Professor|Project Manager|Psychologist|Public Servant|Radiologic Technologist|Real Estate Agent|Receptionist|Respiratory Therapist|Restaurant Owner|Retail Worker|Retired|Roofer|Sales Representative|Scientist|Secretary|Security Guard|Server|Small Business Owner|Social Worker|Software Developer|Speech Therapist|Stay-at-Home Parent|Student|Surgeon|Surveyor|Tailor|Tattoo Artist|Teacher|Teacher's Aide|Technician|Therapist|Tradesperson|Translator|Truck Driver|Tutor|Unemployed / Between Jobs|Veteran|Veterinarian|Veterinary Technician|Volunteer|Waiter / Waitress|Warehouse Worker|Welder|Worship Leader|Writer|Youth Pastor|Zookeeper`.split('|');

export const FAMILY = ['Husband', 'Wife', 'Father', 'Mother', 'Grandfather', 'Grandmother', 'Son', 'Daughter', 'Brother', 'Sister', 'Single', 'Engaged', 'Newly married', 'Divorced', 'Widowed', 'Single parent', 'Expecting a baby', 'Parent of young children', 'Parent of teenagers', 'Parent of adult children', 'Foster or adoptive parent', 'Caregiver for a parent', 'Friend', 'Student', 'New believer', 'Church member', 'Small-group leader', 'Ministry leader'];

export const CARRYING = ['Money stress', 'Debt', 'Health', 'Chronic pain', 'Waiting on test results', 'Grief', 'Anxiety', 'Depression', 'Fear', 'Marriage', 'A prodigal child', 'Family conflict', 'Job search', 'Work stress', 'Addiction recovery', 'Temptation', 'Loneliness', 'Waiting on God', 'A big decision', 'Forgiving someone', 'Guilt or shame', 'Infertility', 'Moving or change', 'Faith feels dry', 'Our nation', 'Our church'];

// Map a calling/life/burden label to verse topics (keys in data/topics.json).
const CAT = {
  health: { re: /nurse|doctor|physician|surgeon|dent|medical|pharma|therap|paramedic|emt|chiropract|hospice|health aide|nursing|radiolog|respirator|optometr|dietitian|nutrition|lab|psycholog|counselor|veterinar/i, topics: ['healing', 'strength', 'service'] },
  ministry: { re: /pastor|minister|missionary|chaplain|worship|youth pastor/i, topics: ['service', 'guidance', 'prayer'] },
  responder: { re: /firefighter|police|correctional|security|dispatcher|lineman|air traffic/i, topics: ['courage', 'strength'] },
  military: { re: /military|veteran/i, topics: ['courage', 'strength', 'peace'] },
  teach: { re: /teacher|professor|principal|tutor|coach|librarian|childcare|nanny|aide/i, topics: ['guidance', 'family', 'work'] },
  business: { re: /business|entrepreneur|owner|manager|consultant|sales|real estate|insurance|banker|loan|financial|accountant|auditor|actuary|bookkeeper|marketing|hr /i, topics: ['work', 'provision', 'guidance'] },
  law: { re: /attorney|lawyer|judge|paralegal|politician|public servant/i, topics: ['guidance', 'character', 'nation'] },
  trades: { re: /carpenter|electric|plumb|weld|mechanic|hvac|roofer|construction|machinist|equipment|miner|tradesperson|maintenance|janitor|cleaner|landscap|gardener|farmer|fisherman|factory|warehouse|truck|driver|technician/i, topics: ['work', 'strength'] },
  arts: { re: /actor|artist|musician|author|writer|designer|photographer|journalist|game|tattoo|florist/i, topics: ['work', 'identity'] },
  student: { re: /student/i, topics: ['guidance', 'identity'] },
  retired: { re: /retired/i, topics: ['aging', 'rest'] },
  between: { re: /unemployed|between jobs|job search/i, topics: ['provision', 'trust', 'waiting'] },
  home: { re: /homemaker|stay-at-home/i, topics: ['family', 'strength'] },
  care: { re: /caregiver|caring for/i, topics: ['strength', 'rest', 'service'] },
  service: { re: /server|waiter|barista|bartender|cashier|retail|hotel|food service|customer service|receptionist|mail|postal|flight attendant|hairstylist|barber|cosmet|esthetic|massage|volunteer/i, topics: ['work', 'service'] },
};
const LIFE = {
  'Husband': ['marriage'], 'Wife': ['marriage'], 'Newly married': ['marriage', 'love'], 'Engaged': ['marriage', 'guidance'],
  'Father': ['family'], 'Mother': ['family'], 'Grandfather': ['family', 'aging'], 'Grandmother': ['family', 'aging'],
  'Son': ['family'], 'Daughter': ['family'], 'Brother': ['family'], 'Sister': ['family'],
  'Single': ['identity', 'guidance'], 'Divorced': ['comfort', 'hope'], 'Widowed': ['comfort', 'lonely'], 'Single parent': ['family', 'strength'],
  'Expecting a baby': ['family', 'anxiety'], 'Parent of young children': ['family', 'strength'], 'Parent of teenagers': ['family', 'guidance'],
  'Parent of adult children': ['family', 'trust'], 'Foster or adoptive parent': ['family', 'love'], 'Caregiver for a parent': ['strength', 'rest'],
  'Friend': ['community', 'love'], 'Student': ['guidance'], 'New believer': ['salvation', 'identity'], 'Church member': ['community'],
  'Small-group leader': ['community', 'service'], 'Ministry leader': ['service', 'guidance'],
  'Money stress': ['provision', 'anxiety'], 'Debt': ['provision', 'trust'], 'Health': ['healing', 'strength'], 'Chronic pain': ['healing', 'strength'],
  'Waiting on test results': ['anxiety', 'peace'], 'Grief': ['comfort', 'hope'], 'Anxiety': ['anxiety', 'peace'], 'Depression': ['hope', 'comfort'],
  'Fear': ['anxiety', 'courage'], 'Marriage': ['marriage', 'forgiveness'], 'A prodigal child': ['family', 'hope'], 'Family conflict': ['forgiveness', 'peace'],
  'Job search': ['provision', 'guidance'], 'Work stress': ['work', 'peace'], 'Addiction recovery': ['temptation', 'strength'], 'Temptation': ['temptation'],
  'Loneliness': ['lonely', 'comfort'], 'Waiting on God': ['waiting', 'trust'], 'A big decision': ['guidance'], 'Forgiving someone': ['forgiveness'],
  'Guilt or shame': ['forgiveness', 'identity'], 'Infertility': ['hope', 'waiting'], 'Moving or change': ['guidance', 'faithful'],
  'Faith feels dry': ['hope', 'prayer'], 'Our nation': ['nation', 'prayer'], 'Our church': ['community', 'prayer'],
};
export function categoryOf(label) {
  for (const [k, c] of Object.entries(CAT)) if (c.re.test(label)) return k;
  return null;
}
export function topicsForProfile(p) {
  const s = new Set();
  for (const c of p.callings || []) {
    const k = categoryOf(c);
    (k ? CAT[k].topics : ['work']).forEach(t => s.add(t));
  }
  for (const x of [...(p.family || []), ...(p.carrying || [])]) (LIFE[x] || []).forEach(t => s.add(t));
  return Array.from(s);
}

// Short prayer prompts. {c} is replaced with the calling.
const PROMPTS = {
  health: ['Lord, give me gentle hands and a steady mind as I care for {p} today. Let each patient sense Your kindness through me.', 'Father, guard my heart from weariness. Give me wisdom for hard decisions and compassion for every person I treat.', 'Great Physician, I bring before You the sick and hurting I will see today. Heal, comfort and give hope.'],
  ministry: ['Lord, fill me before I pour out. Give me Your words for the people You have placed in my care.', 'Shepherd of my soul, protect my family and my flock. Keep me humble, prayerful and faithful.', 'Father, show me who needs encouragement today, and give me courage to speak the truth in love.'],
  responder: ['Lord, be my shield on every call today. Give me courage, clear thinking and a calm spirit.', 'Father, protect my partners and me. Bring everyone home safely tonight.', 'God of peace, help me carry what I see without being crushed by it. Heal what is heavy in me.'],
  military: ['Lord, watch over those I serve beside. Give us courage, discipline and integrity.', 'Prince of Peace, guard my family while we are apart, and heal the wounds that no one sees.', 'Father, help me serve with honor and keep my heart close to You.'],
  teach: ['Lord, give me patience and creativity for every student today. Help me see each one the way You do.', 'Father, use my words to build up, not tear down. Give me wisdom for the student who is struggling most.', 'Teacher of all, renew my energy and my love for this work.'],
  business: ['Lord, I commit my work and my plans to You. Give me wisdom, honesty and favor today.', 'Father, help me lead people well, treat them fairly and steward everything You have entrusted to me.', 'Provider, guide my decisions about money and people. Let my work honor You.'],
  law: ['Lord of justice, give me wisdom and integrity in every decision. Help me defend what is right.', 'Father, keep me honest when it is costly, and humble when I am trusted with authority.', 'God, give me a calm mind and a fair heart for the people I serve today.'],
  trades: ['Lord, bless the work of my hands. Keep me safe and help me do excellent work today.', 'Father, give me strength for the long hours and patience with the job in front of me.', 'Carpenter of Nazareth, let my work and my words point people to You.'],
  arts: ['Creator God, You made me to make. Fill my work with beauty and truth today.', 'Lord, free me from comparison and fear. Let me create for an audience of One.', 'Father, give me fresh ideas and the discipline to finish what I start.'],
  student: ['Lord, give me focus and a good memory as I study. Help me learn for Your glory.', 'Father, guide me toward good friends and wise choices this week.', 'God, calm my worries about the future. You already know the way.'],
  retired: ['Lord, thank You for the years behind me. Show me how to use this season to bless others.', 'Father, keep my mind sharp and my body strong. Let me bear fruit in old age.', 'God, help me pass on Your faithfulness to the next generation.'],
  between: ['Provider, I trust You with what I need today. Open the right door at the right time.', 'Lord, remind me that my worth is not my job title. Give me courage for each application and conversation.', 'Father, meet my family’s needs and give me peace while I wait.'],
  home: ['Lord, You see the work no one else sees. Give me joy and patience in my home today.', 'Father, make our home a place of peace, prayer and welcome.', 'God, renew my strength and help me love my family well.'],
  care: ['Lord, give me strength to care for the one who depends on me, and rest when I am weary.', 'Father, fill me with patience and tenderness today. Carry what I cannot.', 'God of all comfort, comfort me as I comfort others.'],
  service: ['Lord, help me serve every person today as if I were serving You.', 'Father, give me patience with difficult people and a kind word for everyone I meet.', 'God, provide for my needs and bless the work of my hands.'],
  general: ['Lord, I give You this day. Use me where I am, in the work You have given me.', 'Father, help me do my work with excellence and integrity, for Your glory.', 'God, show me one person I can encourage today, and give me courage to do it.'],
};
const CARRY_PROMPT = {
  'Money stress': 'and You know the weight of our finances. Provide what we need and give me peace.',
  'Debt': 'and You know the weight of our debts. Give me wisdom, discipline and hope.',
  'Health': 'and I ask You for healing and strength in my body.',
  'Chronic pain': 'and I ask You for relief from pain and grace for each hour.',
  'Waiting on test results': 'and I place these test results in Your hands. Guard my heart with Your peace.',
  'Grief': 'and You are close to the brokenhearted. Hold me in my grief.',
  'Anxiety': 'and I cast my anxiety on You, because You care for me.',
  'Depression': 'and when the darkness feels heavy, be my light and my hope.',
  'Fear': 'and I choose to trust You when I am afraid.',
  'Marriage': 'and I ask You to heal and strengthen our marriage.',
  'A prodigal child': 'and I ask You to bring my child home to You.',
  'Family conflict': 'and I ask You to bring peace and forgiveness to my family.',
  'Job search': 'and I ask You to lead me to the right work.',
  'Work stress': 'and I ask You to give me rest and wisdom at work.',
  'Addiction recovery': 'and I ask for strength to stay free today, one hour at a time.',
  'Temptation': 'and I ask You for a way out when temptation comes.',
  'Loneliness': 'and I thank You that I am never alone. Bring good friends into my life.',
  'Waiting on God': 'and I will wait for You. Strengthen my heart while I wait.',
  'A big decision': 'and I need Your wisdom for this decision. Make the path clear.',
  'Forgiving someone': 'and I ask You to help me forgive as You have forgiven me.',
  'Guilt or shame': 'and I thank You that there is no condemnation for those in Christ.',
  'Infertility': 'and I bring You the desire of my heart for a child.',
  'Moving or change': 'and I ask You to go before me into this change.',
  'Faith feels dry': 'and I ask You to renew my love for You and Your Word.',
  'Our nation': 'and I pray for our leaders and our nation.',
  'Our church': 'and I pray for our church to be faithful and full of love.',
};
export function prayerPrompt(p, seed) {
  const callings = p.callings || [];
  const c = callings.length ? callings[seed % callings.length] : null;
  const cat = c ? categoryOf(c) || 'general' : 'general';
  const list = PROMPTS[cat];
  let text = list[seed % list.length].replace('{p}', /nurse|doctor|physician|surgeon|therap|dent|optometr|chiropract/i.test(c || '') ? 'my patients' : 'the people in front of me');
  const carry = (p.carrying || []);
  if (carry.length) {
    const k = carry[seed % carry.length];
    if (CARRY_PROMPT[k]) text += ` Lord, ${CARRY_PROMPT[k]}`;
  }
  return { text, calling: c };
}

export const GROUP_TYPES = [
  { k: 'church', n: 'Church', icon: 'church' },
  { k: 'youth', n: 'Youth Group', icon: 'youth' },
  { k: 'bible', n: 'Bible Study', icon: 'book' },
  { k: 'men', n: "Men's Group", icon: 'man' },
  { k: 'women', n: "Women's Group", icon: 'woman' },
  { k: 'small', n: 'Small Group', icon: 'circle3' },
  { k: 'mission', n: 'Mission / Ministry', icon: 'globe' },
  { k: 'family', n: 'Family', icon: 'family' },
  { k: 'other', n: 'Other', icon: 'dots' },
];

export const BELIEVE_STEPS = [
  { t: 'Everyone has fallen short', ref: 'Romans 3:23', note: 'Every one of us has sinned. None of us can reach God by being good enough.' },
  { t: 'Sin separates us from God', ref: 'Romans 6:23', note: 'The result of sin is death, but God offers eternal life as a free gift.' },
  { t: 'God showed His love', ref: 'Romans 5:8', note: 'God did not wait for us to clean up. Christ died for us while we were still sinners.' },
  { t: 'Jesus came for you', ref: 'John 3:16', note: 'God loves the world, and that includes you. Whoever believes in Jesus has eternal life.' },
  { t: 'Believe and confess', ref: 'Romans 10:9-10', note: 'Trust in your heart that Jesus is Lord and that God raised Him from the dead, and say so.' },
  { t: 'Saved by grace', ref: 'Ephesians 2:8-9', note: 'Salvation is a gift you receive by faith, not something you earn.' },
];
export const SALVATION_PRAYER = 'Lord Jesus, I know that I am a sinner and I cannot save myself. I believe You died on the cross for my sins and rose again from the dead. I turn from my sin and put my trust in You. Come into my life. Forgive me and make me new. I receive Your gift of eternal life. Thank You for loving me. From this day on, help me follow You as my Lord. In Jesus’ name, amen.';

export const ENTRY_KINDS = {
  prayers: { n: 'Request', pl: 'Requests', icon: 'pray', desc: 'Things you are asking God for, for yourself and others.' },
  praise: { n: 'Praise', pl: 'Praises & Answers', icon: 'sparkle', desc: 'Thanks to God and the prayers He has answered.' },
  people: { n: 'Person', pl: 'People', icon: 'users', desc: 'The people you are praying for, and every request for them.' },
  topics: { n: 'Topic', pl: 'Topics', icon: 'tag', desc: 'Ongoing themes you pray about, like work, health or your church.' },
  journal: { n: 'Journal', pl: 'Journal', icon: 'journal', desc: 'Your spoken and written prayers, kept in full.' },
  notes: { n: 'Note', pl: 'Notes', icon: 'note', desc: 'Sermon notes and Scripture you want to remember.' },
};
