window.NeoNykeEnvironmentTileDefs = {
  "sourceSize": 16,
  "propSprites": {
    "candle": {
      "pixelSize": 16,
      "palette": { "a": "#6b7077", "b": "#878d95", "c": "#f3ead0", "d": "#b3a079", "e": "#2a2018", "f": "#ff9628", "g": "#ffe078", "h": "#fffff0" },
      "pixels": ["................", "................", ".......f........", "......fgf.......", "......ghg.......", ".......e........", "......ccc.......", ".....ccdcc......", ".....ccdcc......", ".....ccdcc......", ".....ccdcc......", ".....ccdcc......", "....aaaaaaa.....", "...aabbbbbaa....", "................", "................"]
    },
    "brazier": {
      "pixelSize": 16,
      "palette": { "a": "#1a140e", "b": "#5a5f5c", "c": "#d28748", "d": "#f5ca78", "e": "#ff5a24" },
      "pixels": ["................", ".......e........", "......cec.......", "......cdc.......", ".....ccdcc......", "....bbbbbbbb....", "...bbbbbbbbbb...", "...aaaaaaaaaa...", "...aaaaaaaaaa...", "....aaaaaaaa....", ".....aaaaaa.....", "......aaaa......", "................", "................", "................", "................"]
    },
    "rubble": {
      "pixelSize": 16,
      "palette": { "a": "#2a2c26", "b": "#5c5b4c", "c": "#77735f", "d": "#1b1d19" },
      "pixels": ["................", "................", "................", ".....b..........", "...bbcc..b......", "..bddbbbbcc.....", "..bbbbbddbb.....", "...ccbbbbbb.....", "....bbbbcc......", "......dd........", "................", "................", "................", "................", "................", "................"]
    },
    "crack_decal": {
      "pixelSize": 16,
      "palette": { "a": "#151917" },
      "pixels": ["................", "................", "................", "..aa............", "....aa..........", ".....aaa........", ".......aa.......", "......aa........", "........aaa.....", "..........aa....", "............aa..", "................", "................", "................", "................", "................"]
    },
    "tree": {
      "pixelSize": 16,
      "palette": { "a": "#5c3a1e", "b": "#3a7d2c", "c": "#52a83a", "d": "#a0e664", "e": "#14200e" },
      "pixels": ["................", ".....ccccc......", "....ccccccc.....", "...ccbbbbbcc....", "..ccbbbbbbbcc...", "..cbbbbbbbbbc...", "..cbbbdbbbbbc...", "...cbbbbbbbc....", "....ccbbbcc.....", "......aaa.......", "......aaa.......", "......aaa.......", ".....eeeee......", "....eeeeeee.....", "................", "................"]
    },
    "fruit_tree": {
      "pixelSize": 16,
      "palette": { "a": "#5f3d1f", "b": "#3f7a2d", "c": "#58a73d", "d": "#ff7385", "e": "#14200e" },
      "pixels": ["................", "....ccccccc.....", "...ccbbbbbcc....", "..ccbbdbdbcc....", "..cbbbbbbbbbc...", "..cbbbdbbbbbc...", "...cbbbbbbbc....", "....ccbbbcc.....", "......aaa.......", "......aaa.......", "......aaa.......", ".....eeeee......", "....eeeeeee.....", "................", "................", "................"]
    },
    "moss_patch": {
      "pixelSize": 16,
      "palette": { "a": "#112212", "b": "#5c9148", "c": "#95d06d" },
      "pixels": ["................", "................", "................", "................", ".....bbb........", "...bbbbbbb......", "..aabbbbbbaa....", "..aaabbbbbaa....", "...aaacccaa.....", ".....aaaa.......", "................", "................", "................", "................", "................", "................"]
    },
    "cover_wall": {
      "pixelSize": 16,
      "palette": { "a": "#7a4825", "b": "#4b2a18", "c": "#b0743d", "d": "#26140a" },
      "pixels": ["cccccccccccccccc", "caaaaaaaaaaaaabc", "caaaaaaaaaaaaabc", "cdddddddddddddbc", "caaaaaaaaaaaaabc", "caaaaaaaaaaaaabc", "cdddddddddddddbc", "caaaaaaaaaaaaabc", "caaaaaaaaaaaaabc", "cdddddddddddddbc", "caaaaaaaaaaaaabc", "caaaaaaaaaaaaabc", "cbbbbbbbbbbbbbbc", "cbbbbbbbbbbbbbbc", "cbbbbbbbbbbbbbbc", "cccccccccccccccc"]
    },
    "explosive_trap": {
      "pixelSize": 16,
      "palette": { "a": "#2a2620", "b": "#c8a040", "c": "#121418", "d": "#e0b84c", "e": "#ffffff" },
      "pixels": ["................", ".......d........", "......dd........", ".....d..........", ".....bbb........", "....bbbbb.......", "...bbcccbb......", "..bbcccccbb.....", "..bbcccccbb.....", "..bbcccccbb.....", "...bbcccbb......", "....bbbbb.......", ".....bbb........", "................", "................", "................"]
    }
  },
  "tiles": {
    "floor_stone_a": {
      "kind": "floor",
      "base": "#373932",
      "shade": "#2a2d29",
      "edge": "#4b4c42",
      "mortar": "#1d211f",
      "cracks": [
        [
          2,
          5,
          5,
          5,
          7,
          7
        ],
        [
          12,
          2,
          11,
          5,
          13,
          8
        ]
      ],
      "chips": [
        [
          3,
          12,
          2,
          1
        ],
        [
          10,
          10,
          1,
          2
        ],
        [
          13,
          13,
          1,
          1
        ]
      ],
      "palette": {
        "a": "#373932",
        "b": "#2a2d29",
        "c": "#4b4c42",
        "d": "#1d211f",
        "e": "#1d211e",
        "f": "#1c211e",
        "g": "#1d201f",
        "h": "#1c211f",
        "i": "#4b4c43",
        "j": "#4b4d42",
        "k": "#4a4d42",
        "l": "#4a4c42",
        "m": "#4a4c43",
        "n": "#45463e",
        "o": "#363933",
        "p": "#373933",
        "q": "#363932",
        "r": "#373833",
        "s": "#373832",
        "t": "#262a27",
        "u": "#2c302b",
        "v": "#2b2d29",
        "w": "#2b2d28",
        "x": "#1d201e",
        "y": "#363833",
        "z": "#1c201f"
      },
      "pixels": [
        "dddefdgfdehdfege",
        "hijccccklimnjlbd",
        "djopqqaaarstuvwx",
        "giqpyqpqazpgqzzd",
        "dcwzzzspyquzzbbh",
        "fjzzwzzaoszzpvzd",
        "ecqqrzzzaqszzbwh",
        "gjssaasspaazzzbd",
        "hmaaaayaaspsswbe",
        "glqpqqprqzasazve",
        "gzsarapaspvaawzd",
        "dcsaapaaprzazbbz",
        "gzazbapqpsqssvze",
        "dczvbzzzzvbzzbzd",
        "dvzzbzzzbzbbzbzg",
        "dddehezeehgdzdxg"
      ],
      "pixelSize": 16
    },
    "floor_stone_b": {
      "kind": "floor",
      "base": "#313832",
      "shade": "#252b28",
      "edge": "#444b42",
      "mortar": "#1b211f",
      "cracks": [
        [
          4,
          3,
          6,
          6,
          5,
          9
        ],
        [
          9,
          12,
          12,
          11,
          14,
          13
        ]
      ],
      "chips": [
        [
          2,
          2,
          1,
          1
        ],
        [
          8,
          7,
          2,
          1
        ],
        [
          12,
          4,
          1,
          2
        ]
      ]
    },
    "floor_stone_cracked": {
      "kind": "floor",
      "base": "#343630",
      "shade": "#242723",
      "edge": "#4a4a3f",
      "mortar": "#181d1c",
      "cracks": [
        [
          1,
          8,
          5,
          7,
          7,
          10,
          11,
          9,
          15,
          12
        ],
        [
          6,
          1,
          7,
          4,
          10,
          6
        ]
      ],
      "chips": [
        [
          3,
          4,
          2,
          1
        ],
        [
          9,
          13,
          3,
          1
        ],
        [
          12,
          2,
          1,
          2
        ]
      ],
      "palette": {
        "a": "#343630",
        "b": "#242723",
        "c": "#4a4a3f",
        "d": "#181d1c",
        "e": "#181c1c",
        "f": "#191d1c",
        "g": "#191c1c",
        "h": "#4a4b3f",
        "i": "#4b4a3f",
        "j": "#3d3e36",
        "k": "#242925",
        "l": "#4a4b3e",
        "m": "#343631",
        "n": "#30322d",
        "o": "#1b201e",
        "p": "#242623",
        "q": "#343731",
        "r": "#1f2320",
        "s": "#292d28",
        "t": "#343730",
        "u": "#353630",
        "v": "#242722",
        "w": "#252723",
        "x": "#252722",
        "y": "#1a201e",
        "z": "#252622"
      },
      "pixels": [
        "defdddgedffgdfdd",
        "dcchijkccchcclbf",
        "dcammnoaaaaapbpf",
        "diqammrsttuavpwe",
        "diaxbanyzqazawzz",
        "diazzuzzzyauzpzd",
        "ecmzzzqtzzazzvbz",
        "zzdozoauaqmaabvd",
        "dzautzzaazzzazpe",
        "eczqazozzzzzzzbf",
        "dcauatzzaqazzzze",
        "zcmumtzmtuuazzzz",
        "dcaamaatmzamubzd",
        "dcbxpvvppzpzvvpz",
        "dppwbbbbxbbbzpbd",
        "ddfzeeddddzzdefz"
      ],
      "pixelSize": 16
    },
    "floor_stone_moss": {
      "kind": "floor",
      "base": "#30382f",
      "shade": "#242b25",
      "edge": "#46513f",
      "mortar": "#1a221c",
      "moss": "#3f5c32",
      "cracks": [
        [
          3,
          6,
          7,
          7,
          9,
          5
        ],
        [
          11,
          10,
          12,
          13
        ]
      ],
      "chips": [
        [
          2,
          11,
          2,
          1
        ],
        [
          13,
          4,
          1,
          2
        ],
        [
          8,
          2,
          1,
          1
        ]
      ]
    },
    "floor_bone": {
      "kind": "floor",
      "base": "#34342e",
      "shade": "#252621",
      "edge": "#4f4c3f",
      "mortar": "#1b1d19",
      "bone": "#b6a87f",
      "cracks": [
        [
          2,
          6,
          6,
          8,
          10,
          7
        ],
        [
          12,
          3,
          13,
          6
        ]
      ],
      "chips": [
        [
          4,
          12,
          2,
          1
        ],
        [
          11,
          10,
          1,
          2
        ]
      ]
    },
    "floor_ash": {
      "kind": "floor",
      "base": "#30302b",
      "shade": "#20211e",
      "edge": "#4a463c",
      "mortar": "#171815",
      "ash": "#716b5a",
      "ember": "#a64a2a",
      "cracks": [
        [
          3,
          9,
          6,
          8,
          9,
          11
        ],
        [
          10,
          3,
          13,
          4
        ]
      ],
      "chips": [
        [
          2,
          3,
          2,
          1
        ],
        [
          12,
          12,
          2,
          1
        ]
      ],
      "palette": {
        "a": "#30302b",
        "b": "#20211e",
        "c": "#4a463c",
        "d": "#171815",
        "e": "#161914",
        "f": "#161815",
        "g": "#171915",
        "h": "#161814",
        "i": "#4a473c",
        "j": "#4b463c",
        "k": "#4a463d",
        "l": "#171814",
        "m": "#30312a",
        "n": "#30302a",
        "o": "#30312b",
        "p": "#252721",
        "q": "#2a2b26",
        "r": "#21211e",
        "s": "#21201e",
        "t": "#20211f",
        "u": "#20201e",
        "v": "#2b2a26",
        "w": "#1e1f1c",
        "x": "#1c1d1a",
        "y": "#1e201d",
        "z": "#20201f"
      },
      "pixels": [
        "ddedfdddfgdhddgg",
        "fiijciccckckccbl",
        "fjmanaaoanpqarsl",
        "gktuoaoaavwxyzbl",
        "diaamazaazazzbbz",
        "diaaaaanaaaznrtf",
        "hknananaaaaanrtd",
        "zkaazzzaznaonbbd",
        "dcazdzzzmzanmubd",
        "ljzzzzzzznoaobud",
        "ljaonaozzzaaarbg",
        "ljzanzzzaoazabbh",
        "liazaaoazazztbsd",
        "dkbbbbrbrbzbbbrl",
        "ftbtbrtbbbbbbrbd",
        "ddfggddddfdgdlzf"
      ],
      "pixelSize": 16
    },
    "floor_blood": {
      "kind": "floor",
      "base": "#35292a",
      "shade": "#211819",
      "edge": "#514044",
      "mortar": "#171011",
      "blood": "#64121d",
      "cracks": [
        [
          1,
          5,
          5,
          7,
          9,
          6,
          13,
          9
        ],
        [
          7,
          12,
          10,
          10
        ]
      ],
      "chips": [
        [
          4,
          3,
          2,
          1
        ],
        [
          12,
          13,
          1,
          1
        ]
      ]
    },
    "floor_overgrowth": {
      "kind": "floor",
      "base": "#2f372d",
      "shade": "#202720",
      "edge": "#4a593e",
      "mortar": "#171f18",
      "moss": "#46693a",
      "overgrowth": "#63884c",
      "cracks": [
        [
          2,
          10,
          6,
          9,
          9,
          11
        ],
        [
          12,
          4,
          10,
          7
        ]
      ],
      "chips": [
        [
          4,
          5,
          2,
          1
        ],
        [
          11,
          13,
          2,
          1
        ]
      ]
    },
    "floor_leafy": {
      "kind": "floor",
      "base": "#314032",
      "shade": "#202b22",
      "edge": "#4d6847",
      "mortar": "#172117",
      "moss": "#4f7b3f",
      "overgrowth": "#7ca85d",
      "leaf": "#9bd56a",
      "cracks": [
        [
          3,
          5,
          6,
          7,
          10,
          6
        ],
        [
          11,
          11,
          13,
          8
        ]
      ],
      "chips": [
        [
          2,
          12,
          2,
          1
        ],
        [
          13,
          3,
          1,
          2
        ]
      ],
      "palette": {
        "a": "#314032",
        "b": "#202b22",
        "c": "#4d6847",
        "d": "#172117",
        "e": "#172017",
        "f": "#172116",
        "g": "#162017",
        "h": "#172016",
        "i": "#4d6846",
        "j": "#4c6846",
        "k": "#4c6947",
        "l": "#4d6947",
        "m": "#4c6847",
        "n": "#202a22",
        "o": "#162117",
        "p": "#304033",
        "q": "#304032",
        "r": "#314132",
        "s": "#314033",
        "t": "#304133",
        "u": "#202a23",
        "v": "#304132",
        "w": "#2a382b",
        "x": "#314133",
        "y": "#1a251a",
        "z": "#162016"
      },
      "pixels": [
        "ddefdefdddeghddd",
        "dijckljlccmlccnf",
        "oiaapqrstsrrqubd",
        "ecraaapaqaaasbbd",
        "divwaqaaaxsaaunf",
        "dlayzsqazzxsazbe",
        "fcrzzyzezzzazbzd",
        "dlaaazzqqsaazznd",
        "dlprasqaaaxzzzzf",
        "dmqsqxsraazzzzbf",
        "olqsqvaaazzzzzzd",
        "dcqaxssqaaazauzd",
        "dzbzraraasqzaznd",
        "dlzbnzzbbzunzzuf",
        "dnbbzzbbbzuzzzbz",
        "edeoddeddgdeeded"
      ],
      "pixelSize": 16
    },
    "floor_plank": {
      "kind": "plank",
      "base": "#4a3321",
      "shade": "#322315",
      "edge": "#6a4a2d",
      "mortar": "#21170f",
      "cracks": [
        [
          3,
          3,
          5,
          5
        ],
        [
          10,
          9,
          13,
          10
        ]
      ],
      "chips": [
        [
          6,
          13,
          2,
          1
        ],
        [
          13,
          3,
          1,
          2
        ]
      ],
      "palette": {
        "a": "#4a3321",
        "b": "#322315",
        "c": "#6a4a2d",
        "d": "#21170f",
        "e": "#21170e",
        "f": "#20160f",
        "g": "#21160e",
        "h": "#20170f",
        "i": "#21160f",
        "j": "#6a4a2c",
        "k": "#6b4b2d",
        "l": "#6b4b2c",
        "m": "#6b4a2d",
        "n": "#6a4b2d",
        "o": "#332315",
        "p": "#20170e",
        "q": "#4a3221",
        "r": "#3b291b",
        "s": "#4b3321",
        "t": "#4b3221",
        "u": "#322215",
        "v": "#3a281b",
        "w": "#2d1e15",
        "x": "#3a291b",
        "y": "#332314",
        "z": "#332215"
      },
      "pixels": [
        "eefgddegddheeidd",
        "gcjcklmcnjcjccop",
        "ijqrqaasatstaube",
        "dnvwxaaaqaaaqbyd",
        "dczzzzsazaaasbbi",
        "imaqzaszaaszzbzd",
        "djqzazqazzaaszud",
        "zkaqzassasazzuzi",
        "gnasaasszaxzzooe",
        "imtqqzzzazzzzzzd",
        "icztzzasqaqzvubd",
        "dczqzzzsqqsqquuz",
        "dmssqaszaazaaboe",
        "ezzzbzbozooozzbf",
        "iooybzzoubobuyzf",
        "ideiddihdhdidddh"
      ],
      "pixelSize": 16
    },
    "floor_forge": {
      "kind": "floor",
      "base": "#332f29",
      "shade": "#201f1d",
      "edge": "#51483a",
      "mortar": "#181816",
      "ember": "#b85d2f",
      "cracks": [
        [
          2,
          9,
          6,
          8,
          8,
          10
        ],
        [
          10,
          3,
          12,
          5,
          13,
          8
        ]
      ],
      "chips": [
        [
          4,
          4,
          2,
          1
        ],
        [
          11,
          12,
          1,
          2
        ]
      ],
      "palette": {
        "a": "#332f29",
        "b": "#201f1d",
        "c": "#51483a",
        "d": "#181816",
        "e": "#181917",
        "f": "#191916",
        "g": "#181817",
        "h": "#191917",
        "i": "#191817",
        "j": "#191816",
        "k": "#181916",
        "l": "#51483b",
        "m": "#51493a",
        "n": "#50483b",
        "o": "#50483a",
        "p": "#50493a",
        "q": "#201e1d",
        "r": "#322f28",
        "s": "#322e28",
        "t": "#332f28",
        "u": "#332e28",
        "v": "#312c26",
        "w": "#322f29",
        "x": "#211e1d",
        "y": "#302c27",
        "z": "#201e1c"
      },
      "pixels": [
        "defgghijkdkdgidj",
        "dclcmncolpncolqg",
        "dmrasatauavwaxbd",
        "gnttaauaayzzabbe",
        "goaazbazatzzzqbd",
        "gcwatsauattzzzzd",
        "dmazwazzzuavzzzg",
        "gmwazzzrraaazzze",
        "fczdzzzzzaaaazbi",
        "jmzwawyzyawutbbd",
        "dlaattwaawurtzbd",
        "ecaarwatzawzwqbd",
        "kcaazazzaaabszbd",
        "dcqbbbzbzzzzzzqk",
        "kxqzzbqbbqzbbbqd",
        "kdeedjjgdfgjedee"
      ],
      "pixelSize": 16
    },
    "floor_boss": {
      "kind": "floor",
      "base": "#33282a",
      "shade": "#221a1c",
      "edge": "#574148",
      "mortar": "#1a1315",
      "cracks": [
        [
          1,
          4,
          5,
          6,
          9,
          5,
          14,
          8
        ],
        [
          6,
          12,
          8,
          9,
          11,
          11
        ]
      ],
      "chips": [
        [
          4,
          10,
          3,
          1
        ],
        [
          12,
          2,
          1,
          2
        ]
      ]
    },
    "floor_god": {
      "kind": "floor",
      "base": "#4b463a",
      "shade": "#343127",
      "edge": "#766d52",
      "mortar": "#24231d",
      "ember": "#d6aa58",
      "cracks": [
        [
          2,
          5,
          5,
          4,
          8,
          6
        ],
        [
          10,
          11,
          13,
          10
        ]
      ],
      "chips": [
        [
          3,
          12,
          2,
          1
        ],
        [
          12,
          3,
          1,
          2
        ]
      ]
    },
    "wall_stone": {
      "kind": "wall",
      "base": "#2d342f",
      "shade": "#1d2421",
      "edge": "#586257",
      "mortar": "#141817",
      "ivy": "#537d3d",
      "cracks": [
        [
          3,
          3,
          7,
          5,
          9,
          4
        ],
        [
          12,
          9,
          10,
          12
        ]
      ]
    },
    "wall_shop": {
      "kind": "wall",
      "base": "#3d2c21",
      "shade": "#251a12",
      "edge": "#755233",
      "mortar": "#18100b",
      "cracks": [
        [
          4,
          5,
          6,
          6
        ],
        [
          11,
          3,
          13,
          5
        ]
      ]
    },
    "wall_forge": {
      "kind": "wall",
      "base": "#393430",
      "shade": "#211f1d",
      "edge": "#625747",
      "mortar": "#151413",
      "ember": "#b85d2f",
      "cracks": [
        [
          3,
          10,
          6,
          8,
          9,
          9
        ],
        [
          11,
          2,
          12,
          5
        ]
      ]
    },
    "wall_boss": {
      "kind": "wall",
      "base": "#34262b",
      "shade": "#1d1518",
      "edge": "#684a52",
      "mortar": "#160f11",
      "cracks": [
        [
          2,
          4,
          6,
          5,
          9,
          8
        ],
        [
          11,
          12,
          13,
          9
        ]
      ]
    },
    "wall_god": {
      "kind": "wall",
      "base": "#4a4233",
      "shade": "#2b281f",
      "edge": "#897452",
      "mortar": "#1c1a14",
      "ember": "#d8b160",
      "cracks": [
        [
          3,
          4,
          6,
          5
        ],
        [
          10,
          10,
          13,
          12
        ]
      ]
    },
    "threshold_stone": {
      "kind": "threshold",
      "base": "#3d4038",
      "shade": "#292d29",
      "edge": "#655a45",
      "mortar": "#1b1f1d"
    },
    "threshold_warm": {
      "kind": "threshold",
      "base": "#4b3826",
      "shade": "#2c2118",
      "edge": "#896138",
      "mortar": "#19120d"
    },
    "threshold_boss": {
      "kind": "threshold",
      "base": "#3f2c30",
      "shade": "#24181b",
      "edge": "#855a49",
      "mortar": "#171013"
    },
    "pillar_stone": {
      "kind": "pillar",
      "transparent": true,
      "base": "#4a4d43",
      "shade": "#252b27",
      "edge": "#727060",
      "mortar": "#191d1b"
    },
    "wall_block": {
      "kind": "block",
      "transparent": true,
      "base": "#394038",
      "shade": "#222823",
      "edge": "#626858",
      "mortar": "#171c1a"
    },
    "secret_wall_block": {
      "kind": "block",
      "transparent": true,
      "base": "#31372f",
      "shade": "#20251f",
      "edge": "#596350",
      "mortar": "#151a17",
      "hiddenMark": "#6f5f3c",
      "palette": {
        "a": "#31372f",
        "b": "#20251f",
        "c": "#596350",
        "d": "#151a17",
        "e": "#151b17",
        "f": "#151b16",
        "g": "#141a16",
        "h": "#596351",
        "i": "#586251",
        "j": "#596250",
        "k": "#586350",
        "l": "#586351",
        "m": "#586250",
        "n": "#596251",
        "o": "#21241f",
        "p": "#20251e",
        "q": "#141b17",
        "r": "#31362f",
        "s": "#31372e",
        "t": "#31362e",
        "u": "#141a17",
        "v": "#30372f",
        "w": "#6f5f3c",
        "x": "#6f5f3d",
        "y": "#30372e",
        "z": "#20241e"
      },
      "pixels": [
        "................",
        ".eefddddfdddddd.",
        ".ghiccjklmnkopq.",
        ".dnrsaaarstsbbd.",
        ".uhavvswxayabbd.",
        ".eksarrywrvazpd.",
        ".zkaravvzaaabbd.",
        ".dmayaaaxzrabzd.",
        ".ukrararrsaazzd.",
        ".dcsarraasaapzd.",
        ".ecaavrarsvrzbu.",
        ".dcvaaaaarrrzbd.",
        ".uzbbbbzbbozbbz.",
        ".upzpbbpbzzbpbd.",
        ".dddddzeequqdzu.",
        "................"
      ],
      "pixelSize": 16
    },
    "pot_clay": {
      "kind": "pot",
      "transparent": true,
      "base": "#9b6744",
      "shade": "#57331f",
      "edge": "#d19a68",
      "mortar": "#25150d",
      "palette": {
        "a": "#c68556",
        "b": "#57331f",
        "c": "#d19a68",
        "d": "#25150d",
        "e": "#9b6745",
        "f": "#9a6744",
        "g": "#d09a68",
        "h": "#d19a69",
        "i": "#d09b68",
        "j": "#d19b68",
        "k": "#25150c",
        "l": "#24150d",
        "m": "#25140c",
        "n": "#d19b69",
        "o": "#24150c",
        "p": "#24140c",
        "q": "#25140d",
        "r": "#9b6644",
        "s": "#9b6645",
        "t": "#57321f",
        "u": "#d09b69",
        "v": "#56331e",
        "w": "#57331e",
        "x": "#56331f"
      },
      "pixels": [
        "................",
        "................",
        "................",
        "................",
        ".....gggggg.....",
        ".....gggggg.....",
        "......gggg......",
        "......gggg......",
        "....acaaaaaa....",
        "....agaaaaaa....",
        "....auaaaaaa....",
        "....aaaaaaaa....",
        "....aaaaaaaa....",
        "....aaaaaaaa....",
        "................",
        "................"
      ],
      "pixelSize": 16
    },
    "barrel_oak": {
      "kind": "barrel",
      "transparent": true,
      "base": "#7a4c27",
      "shade": "#3d2414",
      "edge": "#b17a42",
      "band": "#2b2d2c",
      "palette": {
        "a": "#7a4c27",
        "b": "#3d2414",
        "c": "#b17a42",
        "d": "#1c1f1d",
        "e": "#2b2d2c",
        "f": "#2b2d2d",
        "g": "#2a2d2c",
        "h": "#2a2d2d",
        "i": "#b17b42",
        "j": "#b07a42",
        "k": "#b07b42",
        "l": "#2a2c2d",
        "m": "#7b4c26",
        "n": "#2b2c2c",
        "o": "#7a4d27",
        "p": "#7b4c27",
        "q": "#b17a43",
        "r": "#7a4c26",
        "s": "#7a4d26",
        "t": "#3d2415",
        "u": "#3c2414",
        "v": "#2a2c2c",
        "w": "#3d2514"
      },
      "pixels": [
        "................",
        "................",
        "...iiiiiiiiii...",
        "...iiiiiiiiii...",
        "...iiiiiiiiii...",
        "...dddddddddd...",
        "...iiiiiiiiii...",
        "...iiiiiiiiii...",
        "...ijiiiiiiii...",
        "...iiiiiiiiii...",
        "...dddddddddd...",
        "...iiiiiiiiii...",
        "...iiiiiiiiii...",
        "...iiiiiiiiii...",
        "................",
        "................"
      ],
      "pixelSize": 16
    },
    "floor_lava": {
      "kind": "lava",
      "base": "#c43412",
      "shade": "#6a1604",
      "edge": "#ff9a3a",
      "ember": "#ffe27a",
      "crust": "#2c0a04",
      "palette": {
        "a": "#c43412",
        "b": "#6a1604",
        "c": "#ff9a3a",
        "d": "#1c1f1d",
        "e": "#c53412",
        "f": "#c43512",
        "g": "#c43413",
        "h": "#c43513",
        "i": "#c53513",
        "j": "#fe9a3b",
        "k": "#ff9b3b",
        "l": "#fe9b3a",
        "m": "#ff9a3b",
        "n": "#fe9a3a",
        "o": "#c53413",
        "p": "#2c0a04",
        "q": "#c53512",
        "r": "#2c0a05",
        "s": "#ffe27a",
        "t": "#2c0b04",
        "u": "#ff9b3a",
        "v": "#fee27a",
        "w": "#2d0a05",
        "x": "#6a1704",
        "y": "#6b1604",
        "z": "#6b1704"
      },
      "pixels": [
        "aeaafegagaaehaif",
        "ffbbfbbffbbffffo",
        "ffobafffeeeeffff",
        "fheoeffaaahofffa",
        "fffffffffffffeah",
        "fgfqefbbbbbbbfaf",
        "fbfffffffffeffgf",
        "ffffffffffffffff",
        "aaffaaqaffffaeff",
        "aefafqfaeqqaffaa",
        "fafffffffffffffe",
        "aaafgfofgfffffff",
        "afffafoooooooofo",
        "ffffbbbbbbbbbfbf",
        "fbbbbfffffffffff",
        "ffffffffffffffff"
      ],
      "pixelSize": 16
    }
  }
};
