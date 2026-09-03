// The religious content of the Janazah prayer guide.
//
// ---------------------------------------------------------------------------
// READ THIS BEFORE CHANGING ANYTHING HERE
// ---------------------------------------------------------------------------
//
// Everything in this file is religious text that people will read moments
// before praying over someone who has died. It is kept in one file, separate
// from the page that renders it, so that a scholar can review the whole of it
// without reading any code.
//
// Rules for this file:
//
//   1. Every recitation carries its source in `source`. Nothing goes in here
//      without one.
//   2. Nothing is paraphrased, shortened or "tidied". If a text cannot be
//      quoted accurately, it is described in English instead and no Arabic is
//      printed. There is one such case below, marked.
//   3. Where the schools of law differ, both are shown, and neither is
//      presented as the only valid way.
//
// The guide states plainly that details differ between schools and that the
// reader should follow their local imam. That note is not decoration; it is
// the honest position of a notification app that is not a religious
// authority, which is the same thing the terms of service say.

/** Grammatical endings change with who is being prayed for. */
export const PRONOUN_NOTE = {
  heading: 'One dua, four endings',
  body: 'The dua below is written for one man, which is how it is usually '
      + 'taught and memorised. The wording does not change; only the ending '
      + 'does, according to who is being prayed for. An imam leading the '
      + 'prayer makes this change as he recites.',
  forms: [
    ['For a man', 'lahu', 'لَهُ'],
    ['For a woman', 'lahā', 'لَهَا'],
    ['For two people', 'lahumā', 'لَهُمَا'],
    ['For a group', 'lahum', 'لَهُمْ'],
  ],
  footnote: 'Every other pronoun in the dua changes to match in the same way, '
          + 'so "warhamhu" becomes "warhamhā", and so on.',
};

export const STEPS = [
  {
    number: 1,
    title: 'Before the prayer',
    lede: 'Three things are completed before anyone lines up to pray.',
    points: [
      ['Ghusl', 'The body is washed, in a specific and careful way, by people '
        + 'of the same sex as the deceased (a spouse may wash their spouse). '
        + 'Someone who died as a martyr in battle is not washed. This is done '
        + 'by those who know how, and it is not something the congregation '
        + 'takes part in.'],
      ['Kafan', 'The body is shrouded in simple white cloth: customarily three '
        + 'pieces for a man and five for a woman. The plainness is the point. '
        + 'Wealth and status do not travel.'],
      ['Bringing the deceased', 'The body is carried to the place of prayer '
        + 'and placed in front of the imam. The imam stands level with the '
        + 'head of a man and level with the middle of a woman.'],
      ['Standing arrangement', 'The congregation forms rows behind the imam, '
        + 'as in any prayer. Three rows or more is encouraged where there are '
        + 'enough people. Everyone remains standing throughout: there is no '
        + 'rukuʻ and no sujud in this prayer.'],
    ],
  },
  {
    number: 2,
    title: 'Intention',
    lede: 'The intention is made in the heart, and that is all that is needed.',
    body: 'You intend to pray Salat al-Janazah for this deceased person, '
        + 'following the imam. There is no formula to say out loud, and '
        + 'nothing to recite before beginning. If you have arrived without '
        + 'knowing anything about the person, intending to pray for whoever '
        + 'the imam is praying for is enough.',
    aside: 'Saying a memorised niyyah aloud is a widespread custom rather than '
         + 'a requirement, and the majority position is that the intention '
         + 'belongs in the heart.',
  },
];

/**
 * The four takbirs.
 *
 * `arabic` is quoted; `transliteration` uses long vowels marked with a macron
 * so someone reading it aloud lands closer to the actual sound.
 */
export const TAKBIRS = [
  {
    number: 1,
    label: 'First takbir',
    takbir: { arabic: 'اللَّهُ أَكْبَرُ', transliteration: 'Allāhu akbar', meaning: 'Allah is the greatest' },
    intro: 'Raise your hands and say the takbir, then recite quietly.',
    recitations: [
      {
        title: 'Surah al-Fatiha',
        note: 'The practice of the Shafiʻi, Maliki and Hanbali schools, '
            + 'who hold it to be a pillar of this prayer.',
        arabic: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ\n'
              + 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ\n'
              + 'الرَّحْمَٰنِ الرَّحِيمِ\n'
              + 'مَالِكِ يَوْمِ الدِّينِ\n'
              + 'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ\n'
              + 'اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ\n'
              + 'صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ الْمَغْضُوبِ عَلَيْهِمْ وَلَا الضَّالِّينَ',
        transliteration: 'Bismillāhi r-raḥmāni r-raḥīm. Al-ḥamdu lillāhi rabbi l-ʻālamīn. '
                       + 'Ar-raḥmāni r-raḥīm. Māliki yawmi d-dīn. Iyyāka naʻbudu wa iyyāka nastaʻīn. '
                       + 'Ihdinā ṣ-ṣirāṭa l-mustaqīm. Ṣirāṭa lladhīna anʻamta ʻalayhim '
                       + 'ghayri l-maghḍūbi ʻalayhim wa lā ḍ-ḍāllīn.',
        meaning: 'In the name of Allah, the Most Merciful, the Most Compassionate. '
               + 'All praise is for Allah, Lord of all worlds, the Most Merciful, the Most '
               + 'Compassionate, Master of the Day of Judgement. You alone we worship, and '
               + 'You alone we ask for help. Guide us along the straight path, the path of '
               + 'those You have blessed, not of those who have earned Your anger, nor of '
               + 'those who have gone astray.',
        source: "Qur'an, Surah al-Fatiha (1:1–7)",
      },
      {
        title: 'Thana',
        note: 'The practice of the Hanafi school, which recites this in place '
            + 'of al-Fatiha after the first takbir.',
        arabic: 'سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ وَتَبَارَكَ اسْمُكَ وَتَعَالَىٰ جَدُّكَ '
              + 'وَجَلَّ ثَنَاؤُكَ وَلَا إِلَٰهَ غَيْرُكَ',
        transliteration: 'Subḥānaka llāhumma wa biḥamdika, wa tabāraka smuka, wa taʻālā '
                       + 'jadduka, wa jalla thanāʼuka, wa lā ilāha ghayruk.',
        meaning: 'Glory is Yours, O Allah, and praise. Blessed is Your name, exalted is '
               + 'Your majesty, and great is Your praise. There is no god but You.',
        source: 'The opening supplication of the prayer. The Hanafi school adds '
              + '"wa jalla thanāʼuka" in Salat al-Janazah.',
      },
    ],
  },
  {
    number: 2,
    label: 'Second takbir',
    takbir: { arabic: 'اللَّهُ أَكْبَرُ', transliteration: 'Allāhu akbar', meaning: 'Allah is the greatest' },
    intro: 'Say the takbir, then send blessings upon the Prophet ﷺ as you do '
         + 'in the final sitting of any prayer.',
    recitations: [
      {
        title: 'Salat al-Ibrahimiyyah',
        arabic: 'اللَّهُمَّ صَلِّ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ كَمَا صَلَّيْتَ عَلَىٰ '
              + 'إِبْرَاهِيمَ وَعَلَىٰ آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ\n'
              + 'اللَّهُمَّ بَارِكْ عَلَىٰ مُحَمَّدٍ وَعَلَىٰ آلِ مُحَمَّدٍ كَمَا بَارَكْتَ عَلَىٰ '
              + 'إِبْرَاهِيمَ وَعَلَىٰ آلِ إِبْرَاهِيمَ إِنَّكَ حَمِيدٌ مَجِيدٌ',
        transliteration: 'Allāhumma ṣalli ʻalā Muḥammadin wa ʻalā āli Muḥammad, kamā '
                       + 'ṣallayta ʻalā Ibrāhīma wa ʻalā āli Ibrāhīm, innaka ḥamīdun majīd. '
                       + 'Allāhumma bārik ʻalā Muḥammadin wa ʻalā āli Muḥammad, kamā bārakta '
                       + 'ʻalā Ibrāhīma wa ʻalā āli Ibrāhīm, innaka ḥamīdun majīd.',
        meaning: 'O Allah, send Your grace upon Muhammad and upon the family of Muhammad, '
               + 'as You sent Your grace upon Ibrahim and upon the family of Ibrahim. You '
               + 'are indeed Praiseworthy, Glorious. O Allah, send Your blessings upon '
               + 'Muhammad and upon the family of Muhammad, as You blessed Ibrahim and the '
               + 'family of Ibrahim. You are indeed Praiseworthy, Glorious.',
        source: 'Sahih al-Bukhari 3370; Sahih Muslim 406',
      },
    ],
  },
  {
    number: 3,
    label: 'Third takbir',
    takbir: { arabic: 'اللَّهُ أَكْبَرُ', transliteration: 'Allāhu akbar', meaning: 'Allah is the greatest' },
    intro: 'Say the takbir, then make dua for the person who has died. This is '
         + 'the heart of the prayer, and the reason the congregation is '
         + 'standing there at all.',
    recitations: [
      {
        title: 'Dua for the deceased',
        arabic: 'اللَّهُمَّ اغْفِرْ لَهُ وَارْحَمْهُ وَعَافِهِ وَاعْفُ عَنْهُ وَأَكْرِمْ نُزُلَهُ '
              + 'وَوَسِّعْ مُدْخَلَهُ وَاغْسِلْهُ بِالْمَاءِ وَالثَّلْجِ وَالْبَرَدِ وَنَقِّهِ مِنَ '
              + 'الْخَطَايَا كَمَا نَقَّيْتَ الثَّوْبَ الْأَبْيَضَ مِنَ الدَّنَسِ وَأَبْدِلْهُ دَارًا '
              + 'خَيْرًا مِنْ دَارِهِ وَأَهْلًا خَيْرًا مِنْ أَهْلِهِ وَزَوْجًا خَيْرًا مِنْ زَوْجِهِ '
              + 'وَأَدْخِلْهُ الْجَنَّةَ وَأَعِذْهُ مِنْ عَذَابِ الْقَبْرِ وَمِنْ عَذَابِ النَّارِ',
        transliteration: 'Allāhumma ghfir lahu warḥamhu, wa ʻāfihi waʻfu ʻanhu, wa akrim '
                       + 'nuzulahu, wa wassiʻ mudkhalahu, waghsilhu bil-māʼi wath-thalji '
                       + 'wal-barad, wa naqqihi mina l-khaṭāyā kamā naqqayta th-thawba l-abyaḍa '
                       + 'mina d-danas, wa abdilhu dāran khayran min dārihi, wa ahlan khayran min '
                       + 'ahlihi, wa zawjan khayran min zawjihi, wa adkhilhu l-jannah, wa aʻidhhu '
                       + 'min ʻadhābi l-qabri wa min ʻadhābi n-nār.',
        meaning: 'O Allah, forgive him and have mercy on him, keep him safe and pardon him. '
               + 'Receive him with honour and make his grave spacious. Wash him with water, '
               + 'snow and hail, and cleanse him of his faults as a white garment is cleansed '
               + 'of dirt. Give him a home better than his home, a family better than his '
               + 'family, and a spouse better than his spouse. Admit him into Paradise, and '
               + 'protect him from the punishment of the grave and the punishment of the Fire.',
        source: 'Sahih Muslim 963',
      },
      {
        title: 'A dua for everyone present and absent',
        note: 'Also widely recited at this point.',
        arabic: 'اللَّهُمَّ اغْفِرْ لِحَيِّنَا وَمَيِّتِنَا وَشَاهِدِنَا وَغَائِبِنَا وَصَغِيرِنَا '
              + 'وَكَبِيرِنَا وَذَكَرِنَا وَأُنْثَانَا\n'
              + 'اللَّهُمَّ مَنْ أَحْيَيْتَهُ مِنَّا فَأَحْيِهِ عَلَى الْإِسْلَامِ وَمَنْ تَوَفَّيْتَهُ '
              + 'مِنَّا فَتَوَفَّهُ عَلَى الْإِيمَانِ',
        transliteration: 'Allāhumma ghfir liḥayyinā wa mayyitinā, wa shāhidinā wa ghāʼibinā, '
                       + 'wa ṣaghīrinā wa kabīrinā, wa dhakarinā wa unthānā. Allāhumma man '
                       + 'aḥyaytahu minnā fa-aḥyihi ʻalā l-islām, wa man tawaffaytahu minnā '
                       + 'fa-tawaffahu ʻalā l-īmān.',
        meaning: 'O Allah, forgive our living and our dead, those present and those absent, '
               + 'our young and our old, our males and our females. O Allah, whoever of us You '
               + 'keep alive, keep him alive upon Islam, and whoever of us You take, take him '
               + 'upon faith.',
        source: 'Sunan Abu Dawud 3201; Sunan Ibn Majah 1498; Jamiʻ at-Tirmidhi 1024',
      },
    ],
    // Deliberately English only. The duas taught for a child vary between
    // narrations and schools, and this file does not print Arabic it cannot
    // attribute exactly. Better an honest gap than a text someone recites
    // over a child on our word alone.
    childNote: {
      heading: 'When the deceased is a child',
      body: 'The dua is different. A child who has not reached the age of '
          + 'responsibility has no sins to be forgiven, so the dua is made for '
          + 'the parents instead: that the child be a means of reward for them, '
          + 'that they be given patience, and that the child go ahead of them to '
          + 'Paradise. Several wordings are narrated and the schools teach '
          + 'different ones, so ask the imam leading the prayer which he uses '
          + 'rather than taking a version from this page.',
    },
  },
  {
    number: 4,
    label: 'Fourth takbir',
    takbir: { arabic: 'اللَّهُ أَكْبَرُ', transliteration: 'Allāhu akbar', meaning: 'Allah is the greatest' },
    intro: 'Say the takbir, pause briefly, then close the prayer.',
    recitations: [
      {
        title: 'A brief dua',
        note: 'Commonly recited in the Shafiʻi school. In the Hanafi school '
            + 'it is usual to give the taslim directly after this takbir '
            + 'without a further dua. Both are followed by large numbers of '
            + 'Muslims; follow the imam.',
        arabic: 'اللَّهُمَّ لَا تَحْرِمْنَا أَجْرَهُ وَلَا تَفْتِنَّا بَعْدَهُ وَاغْفِرْ لَنَا وَلَهُ',
        transliteration: 'Allāhumma lā taḥrimnā ajrahu wa lā taftinnā baʻdahu, waghfir lanā wa lahu.',
        meaning: 'O Allah, do not deny us his reward, do not test us after him, and forgive '
               + 'us and him.',
        source: 'Narrated in the collections on funeral prayer; widely used at this point.',
      },
    ],
    closing: {
      heading: 'Taslim',
      body: 'Turn the head to the right and say the taslim. Many turn to the '
          + 'left and repeat it; some give one taslim only. Follow the imam.',
      arabic: 'السَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللَّهِ',
      transliteration: 'As-salāmu ʻalaykum wa raḥmatullāh',
      meaning: 'Peace be upon you, and the mercy of Allah',
    },
  },
];

/** The bottom-of-page card, for reading in the thirty seconds before praying. */
export const QUICK_REFERENCE = [
  ['First takbir', 'Al-Fatiha, or Thana in the Hanafi school'],
  ['Second takbir', 'Blessings upon the Prophet ﷺ'],
  ['Third takbir', 'Dua for the deceased'],
  ['Fourth takbir', 'A brief dua, then the taslim'],
];

export const AFTER = {
  heading: 'After the prayer',
  points: [
    ['Following the funeral', 'Accompanying the body to the graveyard is '
      + 'strongly encouraged, and the reward for staying until the burial is '
      + 'greater than for leaving after the prayer.'],
    ['The burial', 'The body is placed in the grave on its right side, facing '
      + 'the qibla. Those present may pour three handfuls of earth into the '
      + 'grave. Graves are kept simple.'],
    ['Dua after burial', 'Stand at the grave afterwards and ask for '
      + 'forgiveness and firmness for the one who has been buried. The '
      + 'Prophet ﷺ taught that they are questioned at this moment.'],
    ['Consoling the family', 'Offer condolences, and mean them briefly rather '
      + 'than at length. Food is prepared for the bereaved family by others, '
      + 'not by them. Visiting, checking in weeks later, and continuing to '
      + 'make dua for the deceased are all part of this.'],
  ],
};

export const SCHOOLS_NOTE =
  'Some details of Salat al-Janazah differ between the schools of Islamic law, '
  + 'including what is recited after the first and fourth takbirs. Where this '
  + 'page shows more than one practice, all of them are followed by large '
  + 'numbers of Muslims. Follow your local imam or a scholar you trust.';

export const SCOPE_NOTE =
  'Taʻziyah is a notification service, not a religious authority. This page '
  + 'is offered as a reminder for people who may not have prayed a Janazah '
  + 'before, with each text’s source given so it can be checked.';

/**
 * The istirjāʻ, recited on hearing of a death.
 *
 * Kept here rather than in the view that shows it, because this file is the
 * one place religious content lives and the one place an imam reviewing it
 * has to read. Arabic verified against the standard text of the ayah; the
 * transliteration follows the same convention as the recitations above.
 */
export const ISTIRJA = {
  arabic: 'إِنَّا لِلَّهِ وَإِنَّا إِلَيْهِ رَاجِعُونَ',
  transliteration: 'Innā lillāhi wa innā ilayhi rājiʻūn',
  english: 'Indeed we belong to Allah, and indeed to Him we return.',
  source: "Qur'an, Surah al-Baqarah (2:156)",
};
