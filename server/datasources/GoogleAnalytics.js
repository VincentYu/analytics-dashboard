const google = require('googleapis');
const async = require('async');
const _ = require('lodash');
const analyticsreporting = google.analyticsreporting('v4');
const url = require('url');
const GoogleDataSource = require('./GoogleDataSource');

class GoogleAnalytics extends GoogleDataSource {
  query(range) {
    return new Promise((resolve,reject) => {
      const requests = this.buildRequests(range);
      async.series(
        _.chunk(requests.reportRequests,5).map((requestSet) => {
          return (next) => {
            analyticsreporting.reports.batchGet({
              'auth': this.jwt,
              'resource': {
                'reportRequests': requestSet
              }
            },{},next);
          }
        }),
        (err,responses) => {
          if (err) {
            reject(err);
          } else {
            const consolodatedResponses = [];
            responses.forEach((response) => {
              response[0].reports.forEach((report) => {
                consolodatedResponses.push(report);
              });
            });
            resolve(this.processResponse(requests.reportTypes,consolodatedResponses));
          }
        }
      );
    });
  }

  buildRequests(range) {
    const reportTypes = [];
    const reportRequests = [];

    this.config.elements.events.forEach((event) => {
      reportTypes.push('events');
      reportRequests.push({
        'metrics': [
          {
            'expression': 'ga:totalEvents'
          }
        ],
        'dimensions': [
          {
            'name': 'ga:eventCategory'
          },
          {
            'name': 'ga:eventAction'
          },
          {
            'name': 'ga:eventLabel'
          }
        ],
        'dimensionFilterClauses': {
          'operator': 'AND',
          'filters': [
            {
              'dimensionName': 'ga:eventCategory',
              'operator': 'EXACT',
              'expressions': [event.category]
            },
            {
              'dimensionName': 'ga:eventLabel',
              'operator': 'EXACT',
              'expressions': [event.label]
            },
            {
              'dimensionName': 'ga:eventAction',
              'operator': 'EXACT',
              'expressions': [event.action]
            }
          ].filter((filter) => {
            return filter.expressions[0];
          })
        }
      })
    });

    this.config.elements.pages.forEach((page) => {
      reportTypes.push('pages');
      const urlObject = url.parse(page.url);
      if (urlObject) {
        reportRequests.push({
          'metrics': [
            {
              'expression': 'ga:sessions'
            },
            {
              'expression': 'ga:hits'
            },
            {
              'expression': 'ga:bounceRate'
            }
          ],
          'dimensions': [
            {
              'name': 'ga:hostname'
            },
            {
              'name': 'ga:pagePath'
            }
          ],
          'dimensionFilterClauses': {
            'operator': 'AND',
            'filters': [
              {
                'dimensionName': 'ga:hostname',
                'operator': 'EXACT',
                'expressions': [urlObject.host]
              },
              {
                'dimensionName': 'ga:pagePath',
                'operator': 'EXACT',
                'expressions': [urlObject.path]
              },
            ].filter((filter) => {
              return filter.expressions[0];
            })
          }
        });
      }
    });

    this.config.elements.goals.forEach((goal) => {
      reportTypes.push('goals');
      reportRequests.push({
        'metrics': [
          {
            'expression': 'ga:goal' + goal.number + 'Completions'
          }
        ]
      });
    });

    if (this.config.elements.topPages) {
      reportTypes.push('topPages');
      reportRequests.push({
        'metrics': [
          {
            'expression': 'ga:hits'
          }
        ],
        'dimensions': [
          {
            'name': 'ga:hostname'
          },
          {
            'name': 'ga:pagePath'
          },
          {
            'name': 'ga:pageTitle'
          }
        ],
        'orderBys': [
          {
            'fieldName': 'ga:hits',
            'orderType': 'VALUE',
            'sortOrder': 'DESCENDING'
          }
        ],
        'pageSize': 100
      });
    }

    if (this.config.elements.referrals) {
      reportTypes.push('referrals');
      reportRequests.push({
        'metrics': [
          {
            'expression': 'ga:hits'
          }
        ],
        'dimensions': [
          {
            'name': 'ga:fullReferrer'
          },
        ],
        'orderBys': [
          {
            'fieldName': 'ga:hits',
            'orderType': 'VALUE',
            'sortOrder': 'DESCENDING'
          }
        ],
        'pageSize': 100
      });
    }

    if (this.config.elements.overallMetrics) {
      reportTypes.push('overallMetrics');
      reportRequests.push({
        'metrics': [
          {
            'expression': 'ga:hits'
          },
          {
            'expression': 'ga:sessions'
          },
          {
            'expression': 'ga:bounceRate'
          },
          {
            'expression': 'ga:percentNewSessions'
          }
        ]
      });
    }

    const now = new Date();
    reportRequests.forEach((request) => {
      request.viewId = this.config.profile;
      request.dateRanges = {
        'startDate': this.formatDate(new Date(now.getTime() - range)),
        'endDate': this.formatDate(now)
      };
      request.samplingLevel = 'LARGE';
      if (request.pageSize) {
        request.pageSize = 10000;
      }
    });

    return {
      reportTypes,
      reportRequests
    };
  }

  processResponse(reportTypes,reports) {
    const intermediateReport = {};
    reports.forEach((report,i) => {
      if (!intermediateReport[reportTypes[i]]) {
        intermediateReport[reportTypes[i]] = [];
      }
      switch(reportTypes[i]) {
        case 'events':
          intermediateReport.events.push(this.parseEventReport(report,intermediateReport.events.length));
          break;
        case 'pages':
          intermediateReport.pages.push(this.parsePagesReport(report,intermediateReport.pages.length));
          break;
        case 'goals':
          intermediateReport.goals.push(this.parseGoalsReport(report,intermediateReport.goals.length));
          break;
        case 'topPages':
          intermediateReport.topPages.push(this.parseTopPagesReport(report,intermediateReport.topPages.length));
          break;
        case 'referrals':
          intermediateReport.referrals.push(this.parseReferralsReport(report,intermediateReport.referrals.length));
          break;
        case 'overallMetrics':
          intermediateReport.overallMetrics.push(this.parseOverallMetricsReport(report,intermediateReport.overallMetrics.length));
          break;
      }
    });
    const finalReport = [];
    if (intermediateReport.events && intermediateReport.events.length > 0) {
      finalReport.push({
        'type': 'callout',
        'label': 'Events',
        'data': intermediateReport.events,
        'key': 'Name',
        'value': 'Total Events'
      })
    }
    if (intermediateReport.pages && intermediateReport.pages.length > 0) {
      finalReport.push({
        'type': 'table',
        'label': 'Key Pages',
        'data': intermediateReport.pages
      })
    }
    if (intermediateReport.goals && intermediateReport.goals.length > 0) {
      finalReport.push({
        'type': 'callout',
        'label': 'Goals',
        'data': intermediateReport.goals,
        'key': 'Name',
        'value': 'Completions'
      })
    }
    if (intermediateReport.topPages && intermediateReport.topPages.length > 0) {
      intermediateReport.topPages.forEach((dataset) => {
        finalReport.push({
          'type': 'barchart',
          'label': 'Top Pages',
          'data': dataset,
          'key': 'Name',
          'value': 'Hits'
        });
      });
    }
    if (intermediateReport.referrals && intermediateReport.referrals.length > 0) {
      intermediateReport.referrals.forEach((dataset) => {
        finalReport.push({
          'type': 'barchart',
          'label': 'Top Referrers',
          'data': dataset,
          'key': 'Referrer',
          'value': 'Hits'
        });
      });
    }
    if (intermediateReport.overallMetrics && intermediateReport.overallMetrics.length > 0) {
      for(var metric in intermediateReport.overallMetrics[0]) {
        finalReport.push({
          'type': 'quickstat',
          'label': metric,
          'data': intermediateReport.overallMetrics[0][metric]
        })
      }
    }
    return finalReport;
  }

  parseEventReport(report,offset) {
    const config = this.config.elements.events[offset];
    if (report.data.rows && report.data.rows.length > 0) {
      const total = report.data.rows.reduce(function(accum,row) {
        if ((config.category && config.category != row.dimensions[0])
            || (config.action && config.action != row.dimensions[1])
            || (config.label && config.label != row.dimensions[2])) {
          throw new Error('Event report mismatch: ' + [config.category+'/'+row.dimensions[0],config.action+'/'+row.dimensions[1],config.label+'/'+row.dimensions[2]].join(', '));
        } else {
          return accum + parseInt(row.metrics[0].values[0]);
        }
      },0);
      return {
        'Name': config.name,
        'Total Events': total
      };
    } else {
      return {
        'Name': config.name,
        'Total Events': 0
      };
    }
  }

  parsePagesReport(report,offset) {
    const config = this.config.elements.pages[offset];
    if (report.data.rows.length == 0) {
      return {
        'Name': config.name,
        'URL': config.url,
        'Sessions': 0,
        'Hits': 0,
        'Bounce Rate': 0
      };
    } else if (report.data.rows.length == 1) {
      const reportRow = report.data.rows[0];
      const configURLObject = url.parse(config.url);
      if (configURLObject.host != reportRow.dimensions[0] && configURLObject.path != reportRow.dimensions[1]) {
        throw new Error('Page report mismatch: ' + [configURLObject.host+'/'+reportRow.dimensions[0] , configURLObject.path+'/'+reportRow.dimensions[1]].join(', '));
      } else {
        return {
          'Name': config.name,
          'URL': config.url,
          'Sessions': parseInt(reportRow.metrics[0].values[0]),
          'Hits': parseInt(reportRow.metrics[0].values[1]),
          'Bounce Rate': parseFloat(reportRow.metrics[0].values[2])
        };
      }
    } else {
      throw new Error('Unexpected number of page rows: ' + report.data.rows.length);
    }
  }

  parseGoalsReport(report,offset) {
    const config = this.config.elements.goals[offset];
    if (report.data.totals) {
      return {
        'Name': config.name,
        'Completions': parseInt(report.data.totals[0].values[0])
      };
    } else {
      throw new Error('Unexpected number of goal report');
    }
  }

  parseTopPagesReport(report,offset) {
    return report.data.rows.map(function(row) {
      return {
        'Name': row.dimensions[2],
        'URL': url.parse('http://' + row.dimensions[0] + row.dimensions[1]).href,
        'Hits': parseInt(row.metrics[0].values[0])
      }
    });
  }

  parseReferralsReport(report,offset) {
    return report.data.rows.map(function(row) {
      return {
        'Referrer': row.dimensions[0],
        'Hits': parseInt(row.metrics[0].values[0])
      }
    });
  }

  parseOverallMetricsReport(report,offset) {
    if (report.data.totals) {
      return {
        'Hits': parseInt(report.data.totals[0].values[0]),
        'Sessions': parseInt(report.data.totals[0].values[1]),
        'Bounce Rate': parseFloat(report.data.totals[0].values[2]),
        'New Users': parseFloat(report.data.totals[0].values[3]).toLocaleString() + '%',
      };
    } else {
      throw new Error('Unexpected number of overall report');
    }
  }
}

module.exports = GoogleAnalytics;