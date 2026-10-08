/* ============================================================================
   Atlas dev fixtures — NOT part of the app.
   Loaded only when the page URL carries ?fixture=<demo|worst|empty|one|huge>.
   It replaces supabase.createClient with an in-memory stand-in so every section
   renders against a chosen dataset through the same query boundary the live
   client uses. Writes are accepted and forgotten. Nothing here touches Supabase.
   ============================================================================ */
(function(){
  const params = new URLSearchParams(location.search);
  const mode = params.get('fixture');
  if(!mode) return;

  /* ---------- helpers ---------- */
  const today = new Date(); today.setHours(0,0,0,0);
  const D = n => { const d = new Date(today); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };   // YYYY-MM-DD, n days from today
  const T = (n, hm) => new Date(D(n) + 'T' + (hm || '09:00')).toISOString();                                        // ISO timestamp
  let _id = 0; const id = () => 'fx-' + (++_id).toString(36).padStart(4, '0');
  const rnd = (() => { let a = 7; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const mkey = s => (s || '').toString().replace(/[^\p{L} ]+/gu, ' ').replace(/\s+/g, ' ').trim().toUpperCase();

  const CATS = ['Food','Groceries','Transport','Home','Health','Fun','Shopping','Bills','Other'];
  const MERCH = [['סטופמרקט','Groceries'],['פנגו','Transport'],['רב קו','Transport'],['סופר פארם','Health'],['APPLE.COM/BILL','Bills'],
    ['NETFLIX.COM','Bills'],['סיבוס','Food'],['WOLT','Food'],['Shufersal Deal','Groceries'],['Castro','Shopping'],['Yes Planet','Fun'],['IKEA','Home']];

  /* ---------- the five datasets ---------- */
  const DATA = {};

  /* demo: the tidy, flattering dataset a screenshot would use */
  DATA.demo = (() => {
    const wo = [], sets = [];
    for(let i = 0; i < 8; i++){
      const w = {id: id(), workout_date: D(-i * 3), notes: i % 2 ? 'Push day' : 'Pull day', created_at: T(-i*3)};
      wo.push(w);
      [['Bench Press', 4, 8, 70], ['Incline Bench Press', 3, 10, 50], ['Lat Pulldown', 3, 10, 60], ['Overhead Press', 3, 8, 40], ['Squat', 4, 6, 100]]
        .forEach(([ex, s, r, kg], k) => sets.push({id: id(), workout_id: w.id, exercise: ex, sets: s, reps: r, weight_kg: kg + (8 - i) * 2.5 * (k % 2), set_number: k + 1, created_at: T(-i*3, '18:0' + k)}));
    }
    const ex = [];
    for(let i = 0; i < 90; i++){ const [m, c] = MERCH[i % MERCH.length]; const amt = Math.round((20 + rnd() * 240) * 100) / 100;
      ex.push({id: id(), amount: amt, category: c, description: m, merchant: m, merchant_key: mkey(m), spent_at: D(-Math.floor(i * 1.3)), created_at: T(-Math.floor(i*1.3), '12:00'), source: i % 3 ? 'applepay' : 'manual'}); }
    return {
      events: [{id: id(), title: 'Dentist appointment', starts_at: T(0, '16:30'), done: false}, {id: id(), title: 'Call the landlord', starts_at: T(1, '10:00'), done: false},
               {id: id(), title: 'Movie night', starts_at: T(3, '20:00'), done: false}, {id: id(), title: 'Pay the electricity bill', starts_at: T(-2, '09:00'), done: true}],
      user_settings: [{intake_plan: {start: D(-12), load_days: 7, load_times: ['08:00','12:00','16:00','20:00'], time: '08:00', dose: 5, protein: 140}, monthly_budget: 9000}],
      intake_log: Array.from({length: 12}, (_, i) => ({day: D(-i), creatine_slots: i < 5 ? [0] : [0,1,2,3], protein_done: i !== 2})),
      workouts: wo, workout_sets: sets, expenses: ex,
      subscriptions: [{id: id(), name: 'Netflix', domain: 'netflix.com', amount: 54.9, billing_day: 12}, {id: id(), name: 'Spotify', domain: 'spotify.com', amount: 23.9, billing_day: 3}, {id: id(), name: 'iCloud+', domain: 'icloud.com', amount: 11.9, billing_day: 27}],
      merchant_rules: MERCH.map(([m, c]) => ({merchant_key: mkey(m), category: c})),
      goals: [{id: id(), title: 'Read 12 books this year', target_date: D(120), progress: 45, status: 'active', created_at: T(-200)},
              {id: id(), title: 'Bench 100 kg', target_date: D(60), progress: 70, status: 'active', created_at: T(-90)},
              {id: id(), title: 'Finish the Atlas house planner', target_date: null, progress: 100, status: 'done', created_at: T(-30)}],
      chores: [{id: id(), name: 'Run the vacuum', frequency_days: 7, last_done: D(-6)}, {id: id(), name: 'Water the plants', frequency_days: 3, last_done: D(-1)},
               {id: id(), name: 'Change bed sheets', frequency_days: 14, last_done: D(-16)}, {id: id(), name: 'Clean the fridge', frequency_days: 30, last_done: null}],
      rent_leases: [{id: 'lease-demo', landlord: 'Dana Levi', address: 'Herzl 12, Tel Aviv', start_month: D(-150).slice(0,8) + '01', months: 12, monthly_rent: 5200, archived: false, created_at: T(-150)}],
      rent_months: Array.from({length: 12}, (_, i) => { const m = new Date(today); m.setDate(1); m.setMonth(m.getMonth() - 5 + i); const mk = m.toLocaleDateString('en-CA').slice(0,8) + '01';
        return {id: id(), lease_id: 'lease-demo', month: mk, amount: 5200, check_no: String(1040 + i), claimed: i < 5, claimed_on: i < 5 ? mk : null}; }),
      meter_readings: Array.from({length: 6}, (_, i) => ({id: id(), kind: 'electricity', read_on: D(-150 + i * 30), reading: 48210 + i * 310})).concat(
                      Array.from({length: 6}, (_, i) => ({id: id(), kind: 'water', read_on: D(-150 + i * 30), reading: 1203 + i * 9}))),
      floor_plans: [],
    };
  })();

  /* worst: every value pushed to something a real user could produce */
  DATA.worst = (() => {
    const LONG_WORD = 'Benachrichtigungseinstellungen-überprüfen-und-aktualisieren';
    const URL = 'https://example.com/workspaces/acme/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved';
    const UUID = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';
    const PASTE = ('Weekly groceries plus the stuff for Friday dinner — Aleksandra is bringing her parents, so double on everything, and the good olive oil. ').repeat(14).trim();   // ~1,900 chars
    const wo = [], sets = [];
    const W = (n, notes) => { const w = {id: id(), workout_date: D(n), notes, created_at: T(n)}; wo.push(w); return w; };
    const S = (w, exercise, s, r, kg) => sets.push({id: id(), workout_id: w.id, exercise, sets: s, reps: r, weight_kg: kg, set_number: sets.length + 1, created_at: T(0, '18:00')});
    const w0 = W(0, 'Push day — felt strong, but a shoulder niggle on the 3rd set of OHP, dropped to 40 kg and did 2 extra sets of face pulls; gym was packed, rest timers slipped to 3 min');
    S(w0, 'Single-arm cable lateral raise (kneeling, behind-the-back variation)', 3, 12, 7.5);
    S(w0, 'Bench Press', 1, 1, 1000);          // typo'd weight
    S(w0, 'Squat', 100, 100, 102.5);           // typo'd sets/reps
    S(w0, 'Deadlift', 5, 5, 0);                // bodyweight-only row
    S(w0, 'Treadmill', 1, 1284, 42.195);       // minutes / km
    S(w0, '<b>Push-up</b> & "dips"', 3, 20, 0);
    S(w0, 'Lat pulldaowns', 3, 10, 60);        // legacy alias
    const w1 = W(-1, ''); S(w1, 'Bench Press', 4, 8, 72.5); S(w1, 'Bench Press', 4, 8, 72.5);   // duplicate rows, same day as another? no: -1
    const w2 = W(-335, 'Eleven months ago'); S(w2, 'Bench Press', 3, 5, 80);
    const w3 = W(-1100, 'Three years ago'); S(w3, 'Overhead Press', 3, 5, 40);
    for(let i = 4; i < 22; i++){ const w = W(-i * 2, i === 10 ? LONG_WORD : null); S(w, pick(['Bench Press','Squat','Deadlift','Lat Pulldown','Overhead Press']), 3, 8, 60 + i); }

    const ex = [];
    const E = (amount, category, description, n, extra) => ex.push(Object.assign({id: id(), amount, category, description, merchant: description, merchant_key: mkey(description), spent_at: D(n), created_at: T(n, '12:00'), source: 'manual'}, extra || {}));
    E(12345678.9, 'Shopping', 'Konstantin Oberhauser-Wettstein Fine Furniture & Interiors GmbH', 0);
    E(-2848, 'Fun', 'GORDONIA HOTELS', -1);
    E(0.30000000000000004, 'Other', 'Rounding', -1);
    E(0, 'Bills', 'צבירה למועדון', -2);
    E(24.99, 'Bills', 'OPENAI *CHATGPT SUBSCR (USD 24.99)', -2, {source: 'applepay'});
    E(1284, 'Groceries', PASTE, -3, {source: 'applepay'});
    E(42, 'Transport', URL, -3);
    E(99, 'Food', '', -4, {merchant: 'WOLT', merchant_key: mkey('WOLT')});
    E(17, 'Food', null, -4, {merchant: null, merchant_key: null});
    E(310, 'Groceries', 'סטופמרקט רמת אביב ג׳ סניף 42 — קניות שבועיות גדולות במיוחד לפני החג', -5, {source: 'applepay'});
    E(58, 'Health', 'نور الهدى عبد الرحمن صيدلية', -5);
    E(1, 'Other', '<script>alert(1)</script>', -6);
    E(7, 'Other', '**bold** &amp; <b>tags</b>', -6);
    E(3.5, 'Other', LONG_WORD, -7);
    for(let i = 0; i < 15; i++) E(20 + i, 'Other', 'BIT העברה', -8 - (i % 5));   // one merchant, 15 Other charges → uncategorised card
    for(let i = 0; i < 9; i++) E(45, 'Other', 'ULEN AD BANSKO ' + i, -9 - i);     // nine more Other merchants (list caps at 8)
    for(let i = 1; i <= 14; i++){ const [m, c] = MERCH[i % MERCH.length]; E(100 + i * 11.11, c, m, -i * 30 - 2); }  // 14 months of history
    E(999999, 'Home', 'Deposit', -60);

    const months = []; for(let i = 0; i < 60; i++){ const m = new Date(today); m.setDate(1); m.setMonth(m.getMonth() - 30 + i); months.push(m.toLocaleDateString('en-CA').slice(0,8) + '01'); }
    return {
      events: [
        {id: id(), title: 'Dentist appointment — Dr. Aleksandra Wiśniewska-Kowalczyk, Weizmann 14, floor 3 (bring the referral and the insurance card)', starts_at: T(0, '16:30'), done: false},
        {id: id(), title: URL, starts_at: T(0, '17:00'), done: false},
        {id: id(), title: 'תור לרופא שיניים בבית החולים איכילוב — להביא הפניה', starts_at: T(0, '18:00'), done: false},
        {id: id(), title: '<script>alert(1)</script>', starts_at: T(0, '19:00'), done: false},
        {id: id(), title: 'Jo', starts_at: T(0, '20:00'), done: true},
        {id: id(), title: '   ', starts_at: T(0, '21:00'), done: false},
        {id: id(), title: 'Line one\nline two', starts_at: T(0, '22:00'), done: false},
        {id: id(), title: '🦊 Fox feeding 👩🏽‍💻', starts_at: T(0, '23:00'), done: false},
        {id: id(), title: LONG_WORD, starts_at: T(1, '09:00'), done: false},
        {id: id(), title: 'Future', starts_at: T(1100, '09:00'), done: false},
        {id: id(), title: 'Ancient, done', starts_at: T(-1100, '09:00'), done: true},
        {id: id(), title: 'Midnight edge', starts_at: new Date(D(0) + 'T23:59:59').toISOString(), done: false},
      ].concat(Array.from({length: 9}, (_, i) => ({id: id(), title: 'Standup ' + (i + 1), starts_at: T(0, '0' + (i % 9) + ':15'), done: false}))),
      user_settings: [{intake_plan: {start: D(-3), load_days: 7, load_times: ['06:00','10:30','15:00','23:45'], time: '08:00', dose: 5, protein: 140}, monthly_budget: 500}],
      intake_log: [{day: D(0), creatine_slots: [0,1], protein_done: false}, {day: D(-1), creatine_slots: [0,1,2,3], protein_done: true}, {day: D(-2), creatine_slots: [], protein_done: true}],
      workouts: wo, workout_sets: sets, expenses: ex,
      subscriptions: [
        {id: id(), name: '🦊 Fox Streaming Premium Family Plan (annual, billed monthly)', domain: null, amount: 1284, billing_day: 28},
        {id: id(), name: '', domain: null, amount: 0, billing_day: 1},
        {id: id(), name: 'Netflix', domain: 'thisdomaindoesnotexist.test', amount: 54.9, billing_day: today.getDate()},
        {id: id(), name: 'נטפליקס', domain: 'netflix.com', amount: 12345.5, billing_day: 15},
        {id: id(), name: 'dana', domain: null, amount: 9.9, billing_day: 7},
      ],
      merchant_rules: [{merchant_key: mkey('OPENAI *CHATGPT SUBSCR (USD 24.99)'), category: 'Bills'}, {merchant_key: mkey('סטופמרקט רמת אביב ג׳ סניף 42 — קניות שבועיות גדולות במיוחד לפני החג'), category: 'Groceries'}, {merchant_key: mkey(PASTE), category: 'Groceries'}],
      goals: [
        {id: id(), title: 'Read every single book on the shelf in the living room, including the ones Aleksandra left here in 2019 that I have been meaning to return to her but have not because I keep thinking I will read them first', target_date: D(400), progress: 15, status: 'active', created_at: T(-20)},
        {id: id(), title: 'Over 100', target_date: D(30), progress: 142, status: 'active', created_at: T(-30)},
        {id: id(), title: 'Negative', target_date: D(30), progress: -3, status: 'active', created_at: T(-30)},
        {id: id(), title: 'Null progress', target_date: D(10), progress: null, status: 'active', created_at: T(-30)},
        {id: id(), title: 'Past target, not done', target_date: D(-12), progress: 60, status: 'active', created_at: T(-100)},
        {id: id(), title: 'Created today, due today', target_date: D(0), progress: 0, status: 'active', created_at: T(0, '00:01')},
        {id: id(), title: 'Three years out', target_date: D(1100), progress: 1, status: 'active', created_at: T(-1)},
        {id: id(), title: LONG_WORD, target_date: null, progress: 50, status: 'active', created_at: T(-5)},
        {id: id(), title: '<b>Bold</b> & "quoted"', target_date: null, progress: 100, status: 'done', created_at: T(-50)},
        {id: id(), title: '', target_date: null, progress: 0, status: 'active', created_at: T(-2)},
      ],
      chores: [
        {id: id(), name: LONG_WORD, frequency_days: 1, last_done: D(-1284)},
        {id: id(), name: 'Water the plants on the balcony, the kitchen window sill and the two big ones in the bedroom, then wipe the saucers', frequency_days: 3, last_done: D(0)},
        {id: id(), name: 'Jo', frequency_days: 365, last_done: null},
        {id: id(), name: 'ניקוי המקרר והקפאת השאריות', frequency_days: 30, last_done: D(-30)},
        {id: id(), name: '<i>html</i>', frequency_days: 7, last_done: D(-6)},
        {id: id(), name: 'Huge gap', frequency_days: 10000, last_done: D(-1)},
      ],
      rent_leases: [{id: 'lease-worst', landlord: 'Konstantin Oberhauser-Wettstein & Aleksandra Wiśniewska-Kowalczyk', address: 'Sderot Rothschild 118, apartment 42, entrance B, Tel Aviv-Yafo 6578312, Israel', start_month: months[0], months: 60, monthly_rent: 12345.5, archived: false, created_at: T(-900)}],
      rent_months: months.map((m, i) => ({id: id(), lease_id: 'lease-worst', month: m, amount: i === 7 ? 0 : i === 8 ? 123456.78 : 12345.5, check_no: i === 3 ? UUID : i === 4 ? '' : i % 2 ? String(5000 + i) : null, claimed: i < 20 && i !== 5 && i !== 9, claimed_on: i < 20 && i !== 5 && i !== 9 ? m : null})),
      meter_readings: [
        {id: id(), kind: 'electricity', read_on: D(-400), reading: 1234567.89}, {id: id(), kind: 'electricity', read_on: D(-370), reading: 1234990.12},
        {id: id(), kind: 'electricity', read_on: D(-340), reading: 12.5},        /* meter swapped: reading dropped */
        {id: id(), kind: 'electricity', read_on: D(-310), reading: 600.25}, {id: id(), kind: 'electricity', read_on: D(-1), reading: 9800},
        {id: id(), kind: 'electricity', read_on: D(0), reading: 9801},           /* two readings a day apart */
        {id: id(), kind: 'water', read_on: D(0), reading: 0},                     /* only one reading, and it's zero */
      ],
      floor_plans: [{id: id(), name: 'Rothschild 118 — the long narrow one we almost rented in 2024', created_at: T(-10),
        data: {W: 6000, H: 200, rooms: [{id: 'r1', kind: 'living', name: LONG_WORD, x: 0, y: 0, w: 3000, h: 200}, {id: 'r2', kind: 'bedroom', name: 'חדר שינה של ההורים', x: 3000, y: 0, w: 3000, h: 200}], items: [], opens: []}}],
    };
  })();

  /* empty: nothing in any table, no settings row */
  DATA.empty = {events: [], user_settings: [], intake_log: [], workouts: [], workout_sets: [], expenses: [], subscriptions: [], merchant_rules: [], goals: [], chores: [], rent_leases: [], rent_months: [], meter_readings: [], floor_plans: []};

  /* one: exactly one of everything, every count at 1 */
  DATA.one = (() => {
    const w = {id: 'wo-one', workout_date: D(0), notes: null, created_at: T(0)};
    return {
      events: [{id: id(), title: 'Dentist', starts_at: T(0, '16:30'), done: false}],
      user_settings: [{intake_plan: {start: D(0), load_days: 7, load_times: ['08:00','12:00','16:00','20:00'], time: '08:00', dose: 5, protein: 140}, monthly_budget: 1}],
      intake_log: [{day: D(0), creatine_slots: [0], protein_done: false}],
      workouts: [w], workout_sets: [{id: id(), workout_id: w.id, exercise: 'Bench Press', sets: 1, reps: 1, weight_kg: 1, set_number: 1, created_at: T(0)}],
      expenses: [{id: id(), amount: 1, category: 'Other', description: 'One', merchant: 'One', merchant_key: 'ONE', spent_at: D(0), created_at: T(0), source: 'manual'}],
      subscriptions: [{id: id(), name: 'Netflix', domain: 'netflix.com', amount: 1, billing_day: 1}],
      merchant_rules: [],
      goals: [{id: id(), title: 'One goal', target_date: D(1), progress: 1, status: 'active', created_at: T(0, '00:01')}],
      chores: [{id: id(), name: 'One chore', frequency_days: 1, last_done: D(-1)}],
      rent_leases: [{id: 'lease-one', landlord: 'J', address: null, start_month: D(0).slice(0,8) + '01', months: 1, monthly_rent: 1, archived: false, created_at: T(0)}],
      rent_months: [{id: id(), lease_id: 'lease-one', month: D(0).slice(0,8) + '01', amount: 1, check_no: '1', claimed: false, claimed_on: null}],
      meter_readings: [{id: id(), kind: 'electricity', read_on: D(0), reading: 1}],
      floor_plans: [],
    };
  })();

  /* huge: realistic upper bounds — years of daily logging, nothing paginated in the UI */
  DATA.huge = (() => {
    const wo = [], sets = [];
    for(let i = 0; i < 400; i++){
      const w = {id: id(), workout_date: D(-i * 2), notes: i % 7 ? null : 'Leg day', created_at: T(-i*2)}; wo.push(w);
      for(let k = 0; k < 6; k++) sets.push({id: id(), workout_id: w.id, exercise: pick(['Bench Press','Squat','Deadlift','Lat Pulldown','Overhead Press','Treadmill','Romanian Deadlift','Cable Fly']), sets: 3 + (k % 2), reps: 8, weight_kg: 40 + (k * 7) + (i % 9) * 2.5, set_number: k + 1, created_at: T(-i*2, '18:00')});
    }
    const ex = [];
    for(let i = 0; i < 1500; i++){ const [m, c] = MERCH[i % MERCH.length]; ex.push({id: id(), amount: Math.round((5 + rnd() * 400) * 100) / 100, category: c, description: m, merchant: m, merchant_key: mkey(m), spent_at: D(-Math.floor(i / 3)), created_at: T(-Math.floor(i/3), '12:00'), source: i % 2 ? 'applepay' : 'import'}); }
    const months = []; for(let i = 0; i < 60; i++){ const m = new Date(today); m.setDate(1); m.setMonth(m.getMonth() - 48 + i); months.push(m.toLocaleDateString('en-CA').slice(0,8) + '01'); }
    return {
      events: Array.from({length: 120}, (_, i) => ({id: id(), title: 'Event ' + (i + 1), starts_at: T(Math.floor(i / 4), '1' + (i % 4) + ':00'), done: false})),
      user_settings: [{intake_plan: {start: D(-200), load_days: 7, load_times: ['08:00','12:00','16:00','20:00'], time: '08:00', dose: 5, protein: 140}, monthly_budget: 12345678.9}],
      intake_log: Array.from({length: 200}, (_, i) => ({day: D(-i), creatine_slots: [0], protein_done: true})),
      workouts: wo, workout_sets: sets, expenses: ex,
      subscriptions: Array.from({length: 50}, (_, i) => ({id: id(), name: 'Service ' + (i + 1), domain: null, amount: 9.9 + i, billing_day: 1 + (i % 28)})),
      merchant_rules: MERCH.map(([m, c]) => ({merchant_key: mkey(m), category: c})),
      goals: Array.from({length: 60}, (_, i) => ({id: id(), title: 'Goal number ' + (i + 1), target_date: D(30 + i * 10), progress: (i * 7) % 100, status: i % 11 ? 'active' : 'done', created_at: T(-i * 5)})),
      chores: Array.from({length: 40}, (_, i) => ({id: id(), name: 'Chore ' + (i + 1), frequency_days: 1 + (i % 30), last_done: D(-(i % 40))})),
      rent_leases: [{id: 'lease-huge', landlord: 'Dana Levi', address: 'Herzl 12', start_month: months[0], months: 60, monthly_rent: 5200, archived: false, created_at: T(-1500)}],
      rent_months: months.map((m, i) => ({id: id(), lease_id: 'lease-huge', month: m, amount: 5200, check_no: String(1000 + i), claimed: i < 48, claimed_on: i < 48 ? m : null})),
      meter_readings: Array.from({length: 100}, (_, i) => ({id: id(), kind: 'electricity', read_on: D(-1000 + i * 10), reading: 10000 + i * 95})).concat(
                      Array.from({length: 100}, (_, i) => ({id: id(), kind: 'water', read_on: D(-1000 + i * 10), reading: 500 + i * 3}))),
      floor_plans: [],
    };
  })();

  const db = DATA[mode];
  if(!db){ console.warn('[fixtures] unknown fixture "' + mode + '"'); return; }
  // a session-draft from a previous fixture would leak into this one
  try{ if(params.get('keep') !== '1'){ localStorage.removeItem('atlas_gym_draft'); localStorage.removeItem('atlas_house_plan'); } }catch(e){}
  if(mode === 'worst'){ try{ localStorage.setItem('atlas_gym_draft', JSON.stringify({date: D(0), notes: 'Push day — felt strong, but a shoulder niggle on the 3rd set of OHP, dropped to 40 kg and did 2 extra sets of face pulls', started: Date.now() - 95 * 60000,
      items: [{ex: 'Single-arm cable lateral raise (kneeling, behind-the-back variation)', sets: 100, reps: 100, kg: 102.75}, {ex: 'Bench Press', sets: 1, reps: 1, kg: 1000}, {ex: 'Treadmill', sets: 1, reps: 1284, kg: 42.195}, {ex: '<b>Push-up</b>', sets: 3, reps: 20, kg: 0}]})); }catch(e){} }

  /* ---------- a query builder that behaves like PostgREST on the fixture arrays ---------- */
  const SESSION = {user: {id: 'fixture-user', email: 'fixture@example.com'}, access_token: 'fixture'};
  const clone = v => JSON.parse(JSON.stringify(v));
  function builder(table){
    const rows = db[table] || [];
    const q = {filters: [], order: [], limit: null, range: null, single: null, head: false, count: null, write: null};
    const api = {};
    const chain = fn => (...a) => { fn(...a); return api; };
    api.select = chain((cols, opts) => { if(opts && opts.head) q.head = true; if(opts && opts.count) q.count = opts.count; });
    ['eq','neq','gt','gte','lt','lte','in','is','like','ilike'].forEach(op => api[op] = chain((col, val) => q.filters.push([op, col, val])));
    api.order = chain((col, o) => q.order.push([col, !(o && o.ascending === false)]));
    api.limit = chain(n => q.limit = n);
    api.range = chain((a, b) => q.range = [a, b]);
    api.maybeSingle = chain(() => q.single = 'maybe');
    api.single = chain(() => q.single = 'one');
    api.insert = chain(v => q.write = ['insert', v]);
    api.upsert = chain(v => q.write = ['upsert', v]);
    api.update = chain(v => q.write = ['update', v]);
    api.delete = chain(() => q.write = ['delete']);
    const match = r => q.filters.every(([op, col, val]) => { const x = r[col];
      switch(op){ case 'eq': return x == val; case 'neq': return x != val; case 'gt': return x > val; case 'gte': return x >= val; case 'lt': return x < val; case 'lte': return x <= val;
        case 'in': return (val || []).includes(x); case 'is': return x == val; default: return true; } });
    const run = () => {
      if(q.write){
        const [kind, v] = q.write;
        if(kind === 'delete') return {data: null, error: null};
        const arr = Array.isArray(v) ? v : [v];
        const out = arr.map(r => Object.assign({id: id(), created_at: new Date().toISOString(), user_id: SESSION.user.id}, r));
        return {data: q.single ? out[0] : out, error: null};
      }
      let out = rows.filter(match);
      q.order.forEach(([col, asc]) => out.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1)));
      if(q.head) return {data: null, count: out.length, error: null};
      if(q.range) out = out.slice(q.range[0], q.range[1] + 1);
      if(q.limit != null) out = out.slice(0, q.limit);
      if(q.single === 'maybe') return {data: out.length ? clone(out[0]) : null, error: null};
      if(q.single === 'one') return out.length ? {data: clone(out[0]), error: null} : {data: null, error: {message: 'Row not found'}};
      return {data: clone(out), count: q.count ? out.length : null, error: null};
    };
    api.then = (res, rej) => new Promise(r => setTimeout(() => r(run()), 20 + Math.random() * 60)).then(res, rej);   // a little latency, like a real round trip
    return api;
  }
  const client = {
    from: builder,
    rpc: () => Promise.resolve({data: null, error: null}),
    auth: {
      getSession: () => Promise.resolve({data: {session: SESSION}, error: null}),
      getUser: () => Promise.resolve({data: {user: SESSION.user}, error: null}),
      onAuthStateChange: cb => { setTimeout(() => cb('SIGNED_IN', SESSION), 0); return {data: {subscription: {unsubscribe(){}}}}; },
      signOut: () => { location.href = location.pathname; return Promise.resolve({error: null}); },
      signInWithPassword: () => Promise.resolve({data: {session: SESSION}, error: null}),
      signUp: () => Promise.resolve({data: {}, error: null}),
      resetPasswordForEmail: () => Promise.resolve({error: null}),
      updateUser: () => Promise.resolve({error: null}),
    },
  };
  window.supabase = Object.assign({}, window.supabase, {createClient: () => client});

  /* ---------- the toggle: dev-only, bottom-centre, no animation on switch ---------- */
  const MODES = [['demo','Demo data'],['worst','Worst case'],['empty','Empty'],['one','One'],['huge','1,500 rows']];
  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Fixture');
    bar.style.cssText = 'position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:999;display:flex;gap:2px;padding:3px;background:#1a1a18;border-radius:99px;box-shadow:0 4px 16px rgba(0,0,0,.25);font:600 12px/1 Space Grotesk,system-ui,sans-serif;max-width:calc(100vw - 16px);overflow-x:auto';
    bar.innerHTML = MODES.map(([k, l]) => `<button type="button" data-fx="${k}" style="flex:none;border:0;border-radius:99px;padding:7px 11px;background:${k === mode ? '#faf9f7' : 'transparent'};color:${k === mode ? '#1a1a18' : '#c9c6bf'};cursor:pointer;font:inherit;white-space:nowrap">${l}</button>`).join('')
      + `<button type="button" data-fx="" style="flex:none;border:0;border-radius:99px;padding:7px 11px;background:transparent;color:#8a877f;cursor:pointer;font:inherit;white-space:nowrap">Live</button>`;
    bar.addEventListener('click', e => { const b = e.target.closest('[data-fx]'); if(!b) return;
      const u = new URL(location.href); if(b.dataset.fx) u.searchParams.set('fixture', b.dataset.fx); else u.searchParams.delete('fixture'); location.href = u.toString(); });
    document.body.appendChild(bar);
    document.body.style.paddingBottom = '56px';
  });
  console.log('[fixtures] ' + mode + ' dataset active — nothing here reaches Supabase');
})();
