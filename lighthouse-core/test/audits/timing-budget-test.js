/**
 * @license Copyright 2019 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const TimingBudgetAudit = require('../../audits/timing-budget.js');
const trace = require('../fixtures/traces/progressive-app-m60.json');
const devtoolsLog = require('../fixtures/traces/progressive-app-m60.devtools.log.json');

/* eslint-env jest */

describe('Performance: Timing budget audit', () => {
  let artifacts;
  let context;
  beforeEach(() => {
    artifacts = {
      devtoolsLogs: {
        defaultPass: devtoolsLog,
      },
      traces: {defaultPass: trace},
      URL: {requestedUrl: 'http://example.com', finalUrl: 'http://example.com'},
    };

    context = {
      computedCache: new Map(),
      settings: {
        throttlingMethod: 'simulate',
      },
    };
  });

  describe('with a budget.json', () => {
    beforeEach(() => {
      context.settings.budgets = [{
        path: '/',
        timings: [
          {
            metric: 'first-contentful-paint',
            budget: 9999,
          },
          {
            metric: 'estimated-input-latency',
            budget: 10,
          },
        ],
      }];
    });

    it('table headers are correct', async () => {
      const result = await TimingBudgetAudit.audit(artifacts, context);
      const headers = result.details.headings;
      expect(headers[0].text).toBeDisplayString('Metric');
      expect(headers[1].text).toBeDisplayString('Measurement');
      expect(headers[2].text).toBeDisplayString('Over Budget');
    });

    it('table item info is correct', async () => {
      const result = await TimingBudgetAudit.audit(artifacts, context);
      const items = result.details.items;
      // Failing Budget
      expect(items[0].label).toBeDisplayString('Estimated Input Latency');
      expect(items[0].measurement).toBeCloseTo(77.8);
      expect(items[0].overBudget).toBeCloseTo(67.8);
    });

    it('calculates the "overBudget" column correctly', async () => {
      const result = await TimingBudgetAudit.audit(artifacts, context);

      // Failing Budget
      expect(result.details.items[0].overBudget).toBeCloseTo(67.8);

      // Passing Budget
      expect(result.details.items[1].overBudget).toBeUndefined();
    });

    it('only includes rows for timing metrics with budgets', async () => {
      const result = await TimingBudgetAudit.audit(artifacts, context);
      expect(result.details.items).toHaveLength(2);
    });

    it('works for all supported timing metrics', async () => {
      const metrics = [
        'first-contentful-paint',
        'first-cpu-idle',
        'interactive',
        'first-meaningful-paint',
        'max-potential-fid',
        'estimated-input-latency',
        'total-blocking-time',
        'speed-index',
      ];
      await Promise.all(metrics.map(async (metric) => {
        context.settings.budgets = [{
          path: '/',
          timings: [
            {
              metric: metric,
              budget: 100,
            },
          ],
        }];
        const result = await TimingBudgetAudit.audit(artifacts, context);
        expect(result.details.items).toHaveLength(1);
      }));
    });

    it('sorts rows by descending budget overage', async () => {
      context.settings.budgets = [{
        path: '/',
        timings: [
          {
            metric: 'first-cpu-idle',
            budget: 0,
          },
          {
            metric: 'interactive',
            budget: 0,
          },
          {
            metric: 'speed-index',
            budget: 0,
          },
        ],
      }];
      const result = await TimingBudgetAudit.audit(artifacts, context);
      const items = result.details.items;
      items.slice(0, -1).forEach((item, index) => {
        expect(item.overBudget).toBeGreaterThanOrEqual(items[index + 1].overBudget);
      });
    });
  });

  describe('budget selection', () => {
    describe('with a matching budget', () => {
      it('applies the correct budget', async () => {
        context.settings.budgets = [{
          path: '/',
          timings: [
            {
              metric: 'interactive',
              budget: 0,
            },
          ],
        },
        {
          path: '/',
          timings: [
            {
              metric: 'first-cpu-idle',
              budget: 0,
            },
          ],
        },
        {
          path: '/not-a-match',
          timings: [
            {
              resourceType: 'estimated-input-delay',
              budget: 0,
            },
          ],
        },
        ];
        const result = await TimingBudgetAudit.audit(artifacts, context);
        expect(result.details.items[0].metric).toBe('first-cpu-idle');
      });
    });

    describe('without a matching budget', () => {
      it('returns "audit does not apply"', async () => {
        context.settings.budgets = [{
          path: '/not-a-match',
          timings: [
            {
              metric: 'speed-index',
              budget: 1000,
            },
          ],
        },
        ];
        const result = await TimingBudgetAudit.audit(artifacts, context);
        expect(result.details).toBeUndefined();
        expect(result.notApplicable).toBe(true);
      });
    });

    describe('without a budget.json', () => {
      beforeEach(() => {
        context.settings.budgets = null;
      });

      it('returns "audit does not apply"', async () => {
        const result = await TimingBudgetAudit.audit(artifacts, context);
        expect(result.details).toBeUndefined();
        expect(result.notApplicable).toBe(true);
      });
    });
  });
});
