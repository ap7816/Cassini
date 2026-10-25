export type SectionType = 'new' | 'fix' | 'perf' | 'change';

export interface ChangeSection {
  type: SectionType;
  // Clés i18n — chaque clé est résolue via t() dans le composant PatchNotesModal
  itemKeys: string[];
}

export interface ChangeEntry {
  version: string;
  date: string;
  sections: ChangeSection[];
}

// Historique complet des versions de l'application, du plus récent au plus ancien
export const CHANGELOG: ChangeEntry[] = [
  {
    version: '6.0.1',
    date: '2026-10-25',
    sections: [
      {
        type: 'new',
        itemKeys: ['changelog.v6_0_1.new_0'],
      },
      {
        type: 'change',
        itemKeys: ['changelog.v6_0_1.change_0', 'changelog.v6_0_1.change_1'],
      },
      {
        type: 'fix',
        itemKeys: ['changelog.v6_0_1.fix_0'],
      },
    ],
  },
  {
    version: '6.0.0',
    date: '2026-10-16',
    sections: [
      {
        type: 'new',
        itemKeys: [
          'changelog.v6_0_0.new_0',
          'changelog.v6_0_0.new_1',
          'changelog.v6_0_0.new_2',
          'changelog.v6_0_0.new_3',
          'changelog.v6_0_0.new_4',
          'changelog.v6_0_0.new_5',
          'changelog.v6_0_0.new_6',
          'changelog.v6_0_0.new_7',
          'changelog.v6_0_0.new_8',
          'changelog.v6_0_0.new_9',
          'changelog.v6_0_0.new_10',
          'changelog.v6_0_0.new_11',
          'changelog.v6_0_0.new_12',
          'changelog.v6_0_0.new_13',
          'changelog.v6_0_0.new_14',
        ],
      },
      {
        type: 'change',
        itemKeys: [
          'changelog.v6_0_0.change_0',
          'changelog.v6_0_0.change_1',
          'changelog.v6_0_0.change_2',
          'changelog.v6_0_0.change_3',
        ],
      },
      {
        type: 'fix',
        itemKeys: [
          'changelog.v6_0_0.fix_0',
          'changelog.v6_0_0.fix_1',
          'changelog.v6_0_0.fix_2',
        ],
      },
      {
        type: 'perf',
        itemKeys: [
          'changelog.v6_0_0.perf_0',
          'changelog.v6_0_0.perf_1',
        ],
      },
    ],
  },
  {
    version: '5.1.0',
    date: '2026-09-27',
    sections: [
      {
        type: 'perf',
        itemKeys: [
          'changelog.v5_1_0.perf_0',
          'changelog.v5_1_0.perf_1',
          'changelog.v5_1_0.perf_2',
          'changelog.v5_1_0.perf_3',
        ],
      },
      {
        type: 'fix',
        itemKeys: [
          'changelog.v5_1_0.fix_0',
        ],
      },
    ],
  },
  {
    version: '5.0.0',
    date: '2026-09-25',
    sections: [
      {
        type: 'new',
        itemKeys: [
          'changelog.v5_0_0.new_0',
          'changelog.v5_0_0.new_1',
          'changelog.v5_0_0.new_2',
          'changelog.v5_0_0.new_3',
          'changelog.v5_0_0.new_4',
          'changelog.v5_0_0.new_5',
          'changelog.v5_0_0.new_6',
          'changelog.v5_0_0.new_7',
          'changelog.v5_0_0.new_8',
          'changelog.v5_0_0.new_9',
        ],
      },
      {
        type: 'fix',
        itemKeys: [
          'changelog.v5_0_0.fix_0',
          'changelog.v5_0_0.fix_1',
          'changelog.v5_0_0.fix_2',
          'changelog.v5_0_0.fix_3',
          'changelog.v5_0_0.fix_4',
          'changelog.v5_0_0.fix_5',
        ],
      },
      {
        type: 'change',
        itemKeys: [
          'changelog.v5_0_0.change_0',
          'changelog.v5_0_0.change_1',
        ],
      },
    ],
  },
  {
    version: '4.0.0',
    date: '2026-09-18',
    sections: [
      {
        type: 'new',
        itemKeys: [
          'changelog.v4_0_0.new_0',
          'changelog.v4_0_0.new_1',
          'changelog.v4_0_0.new_2',
          'changelog.v4_0_0.new_3',
          'changelog.v4_0_0.new_4',
          'changelog.v4_0_0.new_5',
          'changelog.v4_0_0.new_6',
          'changelog.v4_0_0.new_7',
          'changelog.v4_0_0.new_8',
          'changelog.v4_0_0.new_9',
          'changelog.v4_0_0.new_10',
        ],
      },
      {
        type: 'fix',
        itemKeys: [
          'changelog.v4_0_0.fix_0',
          'changelog.v4_0_0.fix_1',
          'changelog.v4_0_0.fix_2',
          'changelog.v4_0_0.fix_3',
        ],
      },
      {
        type: 'perf',
        itemKeys: [
          'changelog.v4_0_0.perf_0',
          'changelog.v4_0_0.perf_1',
        ],
      },
      {
        type: 'change',
        itemKeys: [
          'changelog.v4_0_0.change_0',
          'changelog.v4_0_0.change_1',
        ],
      },
    ],
  },
  {
    version: '3.0.0',
    date: '2026-09-09',
    sections: [
      {
        type: 'new',
        itemKeys: [
          'changelog.v3_0_0.new_0',
          'changelog.v3_0_0.new_1',
          'changelog.v3_0_0.new_2',
          'changelog.v3_0_0.new_3',
          'changelog.v3_0_0.new_4',
          'changelog.v3_0_0.new_5',
          'changelog.v3_0_0.new_6',
          'changelog.v3_0_0.new_7',
          'changelog.v3_0_0.new_8',
          'changelog.v3_0_0.new_9',
          'changelog.v3_0_0.new_10',
          'changelog.v3_0_0.new_11',
        ],
      },
      {
        type: 'fix',
        itemKeys: [
          'changelog.v3_0_0.fix_0',
          'changelog.v3_0_0.fix_1',
          'changelog.v3_0_0.fix_2',
          'changelog.v3_0_0.fix_3',
          'changelog.v3_0_0.fix_4',
          'changelog.v3_0_0.fix_5',
        ],
      },
      {
        type: 'perf',
        itemKeys: [
          'changelog.v3_0_0.perf_0',
          'changelog.v3_0_0.perf_1',
          'changelog.v3_0_0.perf_2',
        ],
      },
      {
        type: 'change',
        itemKeys: [
          'changelog.v3_0_0.change_0',
          'changelog.v3_0_0.change_1',
        ],
      },
    ],
  },
  {
    version: '2.1.0',
    date: '2026-08-13',
    sections: [
      {
        type: 'new',
        itemKeys: [
          'changelog.v2_1_0.new_0',
          'changelog.v2_1_0.new_1',
          'changelog.v2_1_0.new_2',
          'changelog.v2_1_0.new_3',
          'changelog.v2_1_0.new_4',
        ],
      },
      {
        type: 'fix',
        itemKeys: [
          'changelog.v2_1_0.fix_0',
          'changelog.v2_1_0.fix_1',
          'changelog.v2_1_0.fix_2',
          'changelog.v2_1_0.fix_3',
          'changelog.v2_1_0.fix_4',
        ],
      },
      {
        type: 'perf',
        itemKeys: [
          'changelog.v2_1_0.perf_0',
          'changelog.v2_1_0.perf_1',
        ],
      },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-07-11',
    sections: [
      {
        type: 'new',
        itemKeys: [
          'changelog.v1_2_0.new_0',
          'changelog.v1_2_0.new_1',
          'changelog.v1_2_0.new_2',
          'changelog.v1_2_0.new_3',
          'changelog.v1_2_0.new_4',
        ],
      },
      {
        type: 'fix',
        itemKeys: [
          'changelog.v1_2_0.fix_0',
        ],
      },
    ],
  },
  {
    version: '1.1.3',
    date: '2026-05-29',
    sections: [
      {
        type: 'new',
        itemKeys: [
          'changelog.v1_1_3.new_0',
          'changelog.v1_1_3.new_1',
          'changelog.v1_1_3.new_2',
          'changelog.v1_1_3.new_3',
        ],
      },
      {
        type: 'fix',
        itemKeys: [
          'changelog.v1_1_3.fix_0',
          'changelog.v1_1_3.fix_1',
          'changelog.v1_1_3.fix_2',
        ],
      },
      {
        type: 'change',
        itemKeys: [
          'changelog.v1_1_3.change_0',
        ],
      },
    ],
  },
  {
    version: '1.1.2',
    date: '2026-05-28',
    sections: [
      {
        type: 'new',
        itemKeys: [
          'changelog.v1_1_2.new_0',
          'changelog.v1_1_2.new_1',
          'changelog.v1_1_2.new_2',
          'changelog.v1_1_2.new_3',
          'changelog.v1_1_2.new_4',
          'changelog.v1_1_2.new_5',
          'changelog.v1_1_2.new_6',
        ],
      },
      {
        type: 'fix',
        itemKeys: [
          'changelog.v1_1_2.fix_0',
          'changelog.v1_1_2.fix_1',
          'changelog.v1_1_2.fix_2',
          'changelog.v1_1_2.fix_3',
        ],
      },
      {
        type: 'perf',
        itemKeys: [
          'changelog.v1_1_2.perf_0',
        ],
      },
    ],
  },
  {
    version: '1.1.1',
    date: '2026-05-03',
    sections: [
      {
        type: 'new',
        itemKeys: [
          'changelog.v1_1_1.new_0',
        ],
      },
      {
        type: 'perf',
        itemKeys: [
          'changelog.v1_1_1.perf_0',
          'changelog.v1_1_1.perf_1',
          'changelog.v1_1_1.perf_2',
        ],
      },
      {
        type: 'fix',
        itemKeys: [
          'changelog.v1_1_1.fix_0',
        ],
      },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-04-28',
    sections: [
      {
        type: 'new',
        itemKeys: [
          'changelog.v1_1_0.new_0',
          'changelog.v1_1_0.new_1',
          'changelog.v1_1_0.new_2',
          'changelog.v1_1_0.new_3',
        ],
      },
    ],
  },
  {
    version: '1.0.51',
    date: '2026-04-15',
    sections: [
      {
        type: 'new',
        itemKeys: [
          'changelog.v1_0_51.new_0',
          'changelog.v1_0_51.new_1',
          'changelog.v1_0_51.new_2',
          'changelog.v1_0_51.new_3',
          'changelog.v1_0_51.new_4',
          'changelog.v1_0_51.new_5',
        ],
      },
      {
        type: 'change',
        itemKeys: [
          'changelog.v1_0_51.change_0',
          'changelog.v1_0_51.change_1',
        ],
      },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-03-01',
    sections: [
      {
        type: 'new',
        itemKeys: [
          'changelog.v1_0_0.new_0',
          'changelog.v1_0_0.new_1',
          'changelog.v1_0_0.new_2',
          'changelog.v1_0_0.new_3',
          'changelog.v1_0_0.new_4',
          'changelog.v1_0_0.new_5',
          'changelog.v1_0_0.new_6',
        ],
      },
    ],
  },
];
