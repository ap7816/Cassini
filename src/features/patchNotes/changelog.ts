export type SectionType = 'new' | 'fix' | 'perf' | 'change';

export interface ChangeSection {
  type: SectionType;
  /** Clés i18n — chaque clé est résolue via t() dans le composant */
  itemKeys: string[];
}

export interface ChangeEntry {
  version: string;
  date: string; // 'YYYY-MM-DD'
  sections: ChangeSection[];
}

export const CHANGELOG: ChangeEntry[] = [
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
