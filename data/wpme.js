/* Dataset: Word Power Made Easy (Norman Lewis).
   Registered into a book-agnostic registry so the app never hard-codes this book.
   To add another book, create data/<id>.js that pushes onto window.VocabDatasets
   with the same shape, and include it in app/index.html. User progress is keyed
   per-dataset, so adding/switching books preserves each book's history. */

window.VocabDatasets = window.VocabDatasets || [];

window.VocabDatasets.push({
  id: "wpme",
  title: "Word Power Made Easy",
  author: "Norman Lewis",
  unitLabel: "Session",          // what the source calls its chapters/sessions
  // Which book chapter each session belongs to (WPME: Ch.3 = Sessions 1–3, etc.).
  chapterOf: { 1: 3, 2: 3, 3: 3 },
  originColors: { latin: "latin", greek: "greek", french: "french" },
  roots: [
    {
      id: "ego", label: "EGO", origin: "latin", meaning: "I, self",
      words: [
        { word: "egoist", pos: "n", meaning: "one guided chiefly by self-interest — \"what's in it for me?\"",
          example: "The egoist made every decision based on personal gain, ignoring how it affected the team.",
          contrast: "an altruist is the direct opposite — puts others' welfare first", related: ["altruist"], unit: 1 },
        { word: "egotist", pos: "n", meaning: "one who talks about himself constantly and boastfully",
          example: "The egotist couldn't get through dinner without bragging about his own achievements.",
          contrast: "egoist acts from self-interest; egotist talks about himself — the extra t is for \"talk\"", unit: 1 },
        { word: "egocentric", pos: "adj", meaning: "regarding oneself as the center of the universe; an extreme form of egoist",
          example: "Her egocentric worldview made it impossible for her to see any situation from someone else's perspective.", unit: 2 },
        { word: "egomaniac", pos: "n", meaning: "one whose self-obsession has become a mania — a morbid obsession with one's own needs",
          example: "The egomaniac fired anyone who dared disagree with him.", unit: 2 },
        { word: "egomaniacal", pos: "adj", meaning: "adjective form of egomaniac",
          example: "His egomaniacal demands left the whole crew exhausted.", related: ["egomaniac"], unit: 2 }
      ]
    },
    {
      id: "alter", label: "ALTER", origin: "latin", meaning: "other",
      words: [
        { word: "altruist", pos: "n", meaning: "one devoted to the welfare of others over their own",
          example: "A true altruist, she spent her weekends at the shelter and never mentioned it to anyone.",
          contrast: "the direct opposite of an egoist", related: ["egoist"], unit: 1 },
        { word: "altruism", pos: "n", meaning: "the philosophy or practice of putting others' welfare first",
          example: "His altruism showed in the quiet way he paid for a stranger's groceries.", unit: 2 },
        { word: "altruistic", pos: "adj", meaning: "looking toward the benefit of others",
          example: "Donating the entire prize was an altruistic gesture that surprised everyone.", unit: 2 },
        { word: "alternate", pos: "v", meaning: "to take one, skip one, take the other, and so on",
          example: "We alternate hosting the meeting between the two offices.", unit: 2 },
        { word: "alternate", pos: "adj/n", meaning: "a substitute who takes over if the original choice is unavailable",
          example: "When the lead actor fell ill, the alternate stepped in without missing a line.", unit: 2 },
        { word: "alternative", pos: "n", meaning: "another choice; an other option",
          example: "If flying is too expensive, the overnight train is a comfortable alternative.", unit: 2 },
        { word: "alteration", pos: "n", meaning: "a change; a making into something other",
          example: "The tailor made one small alteration to the sleeves and the jacket fit perfectly.", unit: 2 },
        { word: "alter ego", pos: "n phrase", meaning: "one's other self — someone so close you both think and act alike",
          example: "On stage he becomes his alter ego, a fearless performer nothing like his shy offstage self.", unit: 2 },
        { word: "altercation", pos: "n", meaning: "a heated verbal dispute",
          example: "A minor disagreement over a parking space escalated into a shouting altercation.",
          contrast: "stronger than \"quarrel\" or \"dispute\" — implies real heat, possibly angry or profane", unit: 2 }
      ]
    },
    {
      id: "verto", label: "VERTO (intro-, extro-, ambi-)", origin: "latin", meaning: "to turn",
      words: [
        { word: "introvert", pos: "n", meaning: "one whose thoughts and interests are turned inward",
          example: "As an introvert, she recharged by spending a quiet evening alone with a book.", unit: 1 },
        { word: "extrovert", pos: "n", meaning: "one whose thoughts and interests are turned outward, toward others",
          example: "The extrovert worked the entire room, striking up a conversation with everyone in it.",
          contrast: "opposite of introvert", related: ["introvert"], unit: 1 },
        { word: "ambivert", pos: "n", meaning: "one with both introverted and extroverted tendencies — most people, really",
          example: "An ambivert, he could enjoy a lively party or a solitary hike with equal ease.",
          related: ["introvert", "extrovert", "ambidextrous"], unit: 1 }
      ]
    },
    {
      id: "dexter", label: "DEXTER", origin: "latin", meaning: "right hand",
      words: [
        { word: "dexterous", pos: "adj", meaning: "skillful",
          example: "The dexterous surgeon tied the tiny sutures with remarkable ease.", related: ["adroit"], unit: 3 },
        { word: "dexterity", pos: "n", meaning: "skill",
          example: "Playing the piano at that speed takes extraordinary finger dexterity.", unit: 3 },
        { word: "ambidextrous", pos: "adj", meaning: "able to use both hands with equal skill (ambi-, both + dexter, right hand)",
          example: "Being ambidextrous, she could write with her left hand while sketching with her right.",
          related: ["ambivert"], unit: 3 },
        { word: "ambidexterity", pos: "n", meaning: "noun form of ambidextrous",
          example: "His ambidexterity made him a versatile fielder who could throw with either arm.", related: ["ambidextrous"], unit: 3 }
      ]
    },
    {
      id: "sinister", label: "SINISTER", origin: "latin", meaning: "left hand",
      words: [
        { word: "sinister", pos: "adj", meaning: "threatening, evil, dangerous — from the old suspicion of left-handed people",
          example: "A sinister figure lingered in the shadows outside the house.",
          contrast: "dexter (right) became positive (\"dexterous\"); sinister (left) became negative — an old bias baked into the language",
          related: ["dexterous", "gauche"], unit: 3 }
      ]
    },
    {
      id: "gauche", label: "GAUCHE", origin: "french", meaning: "left hand",
      words: [
        { word: "gauche", pos: "adj", meaning: "clumsy, tactless, lacking social finesse",
          example: "It was gauche of him to ask how much everyone at the dinner table earned.", related: ["adroit"], unit: 3 },
        { word: "gaucherie", pos: "n", meaning: "an awkward, tactless way of saying or doing something",
          example: "Her gaucherie at the formal reception left her cringing about it for hours.",
          contrast: "the opposite of adroitness", related: ["adroitness"], unit: 3 }
      ]
    },
    {
      id: "droit", label: "DROIT", origin: "french", meaning: "right hand",
      words: [
        { word: "adroit", pos: "adj", meaning: "skillful, especially mentally — quick-witted, clever in handling situations",
          example: "The adroit negotiator turned a tense standoff into a deal everyone could accept.",
          contrast: "gauche vs. adroit are opposites; adroit is usually figurative (mental skill), unlike dexterous which can be physical or mental",
          related: ["gauche", "dexterous"], unit: 3 },
        { word: "adroitness", pos: "n", meaning: "noun form of adroit",
          example: "She fielded the reporters' hostile questions with impressive adroitness.", related: ["gaucherie"], unit: 3 }
      ]
    },
    {
      id: "misein", label: "MISEIN", origin: "greek", meaning: "to hate",
      words: [
        { word: "misanthrope", pos: "n", meaning: "one who hates humanity/mankind (misein, hate + anthropos, mankind)",
          example: "The old misanthrope preferred the company of his dogs to that of any human being.",
          related: ["anthropology"], unit: 1 },
        { word: "misogynist", pos: "n", meaning: "one who hates women (misein, hate + gyne, woman)",
          example: "His dismissive remarks about every female colleague exposed him as a misogynist.",
          related: ["gynecologist"], unit: 1 },
        { word: "misogamist", pos: "n", meaning: "one who hates marriage (misein, hate + gamos, marriage)",
          example: "A committed misogamist, he insisted he would never walk down the aisle.",
          related: ["monogamy"], unit: 1 }
      ]
    },
    {
      id: "anthropos", label: "ANTHROPOS", origin: "greek", meaning: "mankind",
      words: [
        { word: "anthropology", pos: "n", meaning: "the study of the development of the human race",
          example: "Her anthropology degree took her to remote villages to study vanishing customs.", unit: 3 },
        { word: "anthropologist", pos: "n", meaning: "one who studies anthropology",
          example: "The anthropologist lived with the tribe for a year to document their traditions.", unit: 3 },
        { word: "anthropological", pos: "adj", meaning: "adjective form of anthropology",
          example: "The dig yielded anthropological evidence of a settlement thousands of years old.", unit: 3 },
        { word: "philanthropist", pos: "n", meaning: "one who loves mankind, shown through substantial charitable giving",
          example: "The philanthropist donated millions to build schools across the region.", unit: 3 },
        { word: "philanthropy", pos: "n", meaning: "love of mankind expressed through charitable giving",
          example: "Her lifelong philanthropy funded hospitals in a dozen countries.", unit: 3 },
        { word: "philanthropic", pos: "adj", meaning: "adjective form of philanthropy",
          example: "The company's philanthropic arm supports scholarships for underprivileged students.", unit: 3 }
      ]
    },
    {
      id: "gyne", label: "GYNE", origin: "greek", meaning: "woman",
      words: [
        { word: "gynecologist", pos: "n", meaning: "medical specialist who treats female disorders",
          example: "She scheduled her annual check-up with her gynecologist.", unit: 3 },
        { word: "gynecology", pos: "n", meaning: "the medical specialty treating female disorders",
          example: "After medical school he chose to specialize in gynecology.", unit: 3 },
        { word: "gynecological", pos: "adj", meaning: "adjective form of gynecology",
          example: "The clinic offers a full range of gynecological services.", unit: 3 },
        { word: "misogyny", pos: "n", meaning: "hatred of women",
          example: "The film was criticized for the casual misogyny running through its dialogue.", related: ["misogynist"], unit: 3 },
        { word: "misogynous", pos: "adj", meaning: "adjective form of misogyny (also: misogynistic)",
          example: "His misogynous attitude quickly cost him the respect of the whole team.", unit: 3 }
      ]
    },
    {
      id: "gamos", label: "GAMOS", origin: "greek", meaning: "marriage",
      words: [
        { word: "monogamy", pos: "n", meaning: "the custom of only one marriage at a time (Greek monos, one)",
          example: "Swans are often held up as a symbol of lifelong monogamy.", unit: 3 },
        { word: "monogamist", pos: "n", meaning: "one who practices monogamy",
          example: "A devoted monogamist, he had been with the same partner for forty years.", unit: 3 },
        { word: "monogamous", pos: "adj", meaning: "adjective form of monogamy",
          example: "Many bird species form monogamous pairs for an entire breeding season.", unit: 3 },
        { word: "bigamy", pos: "n", meaning: "the unlawful act of contracting another marriage without divorcing the current spouse (Latin bi-, two)",
          example: "He was charged with bigamy after his second wife discovered the first.", unit: 3 },
        { word: "bigamist", pos: "n", meaning: "one who commits bigamy",
          example: "The bigamist had quietly maintained two households in different cities for years.", unit: 3 },
        { word: "bigamous", pos: "adj", meaning: "adjective form of bigamy",
          example: "Their bigamous marriage was annulled the moment the truth came out.", unit: 3 },
        { word: "polygamy", pos: "n", meaning: "marriage to multiple spouses (Greek polys, many)",
          example: "Polygamy was common among the wealthy rulers of that era.", unit: 3 },
        { word: "polygamist", pos: "n", meaning: "one who practices polygamy",
          example: "The polygamist supported several wives on his sprawling estate.", unit: 3 },
        { word: "polygamous", pos: "adj", meaning: "adjective form of polygamy",
          example: "The sect's polygamous lifestyle eventually drew legal scrutiny.", unit: 3 },
        { word: "polygyny", pos: "n", meaning: "one man, many wives (polys, many + gyne, woman) — the technically correct term for what's loosely called polygamy",
          example: "In polygyny, one husband is married to several wives at the same time.",
          contrast: "polygamy is the general/loose term; polygyny and polyandry are the technically precise ones", related: ["polyandry"], unit: 3 },
        { word: "polygynous", pos: "adj", meaning: "adjective form of polygyny",
          example: "The polygynous household included four wives and their many children.", unit: 3 },
        { word: "polyandry", pos: "n", meaning: "one woman, many husbands (polys, many + andros, male) — practiced in parts of Tibet",
          example: "Polyandry, in which a woman takes several husbands, is still practiced in parts of Tibet.",
          related: ["polygyny"], unit: 3 },
        { word: "polyandrous", pos: "adj", meaning: "adjective form of polyandry",
          example: "The polyandrous custom kept the family's land from being divided among heirs.", unit: 3 }
      ]
    },
    {
      id: "asketes", label: "ASKETES", origin: "greek", meaning: "monk, hermit",
      words: [
        { word: "ascetic", pos: "n/adj", meaning: "one who lives an austere, self-denying life, like a monk",
          example: "The ascetic lived in a bare mountain hut, eating only bread and water.", unit: 1 },
        { word: "asceticism", pos: "n", meaning: "the practice of ascetic self-denial",
          example: "His asceticism meant no luxuries, no rich food, and hours of daily meditation.", related: ["ascetic"], unit: 3 }
      ]
    }
  ],
  morphology: [
    {
      id: "suffix-ist-y-ic", rule: "-ist (person) / -y (the practice) / -ic or -ous (adjective) — a productive family",
      examples: [
        "misanthropist / misanthropy / misanthropic",
        "monogamist / monogamy / monogamous",
        "bigamist / bigamy / bigamous",
        "polygamist / polygamy / polygamous",
        "polygynist / polygyny / polygynous",
        "polyandrist / polyandry / polyandrous",
        "philanthropist / philanthropy / philanthropic",
        "anthropologist / anthropology / anthropological",
        "gynecologist / gynecology / gynecological"
      ],
      unit: 3
    },
    {
      id: "prefix-quantity", rule: "mono- (Greek, one) / bi- (Latin, two) / poly- (Greek, many) — quantity prefixes",
      examples: [
        "monogamy — one marriage at a time",
        "bigamy — (illegally) two marriages at once",
        "polygamy — many marriages/spouses"
      ],
      unit: 3
    },
    {
      id: "suffix-al", rule: "-al — common adjective-forming suffix",
      examples: ["egomaniac → egomaniacal"],
      unit: 2
    },
    {
      id: "suffix-ity", rule: "-ity — noun suffix for a quality or condition",
      examples: ["dexterous → dexterity", "ambidextrous → ambidexterity", "adroit → adroitness (irregular: -ness, not -ity)"],
      unit: 3
    }
  ]
});
