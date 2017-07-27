process.env.NODE_ENV = 'test';

const chai = require('chai');
const chaiHttp = require('chai-http');
const server = require('./server');
const should = chai.should();
const FeedBenchmarks = require('./datasources/FeedBenchmarks');
const FeedTable = require('./datasources/FeedTable');
const GoogleAnalytics = require('./datasources/GoogleAnalytics');
const MailchimpStats = require('./datasources/MailchimpStats');
const assert = require('assert');
const _ = require('lodash');
const url = require('url');
const secrets = require('./test/config/secrets');
const fs = require('fs-extra');
const JSONEncrypter = require('./lib/JSONEncrypter');

chai.use(chaiHttp);

const fixFeed = (feed) => {
  feed.forEach((feedItem) => {
    feedItem.pubdate = new Date(Date.parse(feedItem.pubdate));
    feedItem.pubDate = new Date(Date.parse(feedItem.pubDate));
  });
}

const fixUrls = (urls) => {
  return urls.map((urlStr) => {
    return url.parse(urlStr.href || urlStr);
  });
}

describe('Web API',() => {
  let api = null;

  beforeEach(() => {
    return server()
      .then((_api) => {
        api = _api;
      });
  });

  it('GET /api/datasource',(done) => {
    chai.request(api)
      .get('/api/datasource')
      .end((err, res) => {
        res.should.have.status(200);
        res.body.should.be.a('array');
        res.body.length.should.be.eql(2);
        res.body[0].should.be.eql('googleanalytics');
        res.body[1].should.be.eql('mailchimpstats');
        done();
      });
  });
});

describe('Datasources',() => {

  describe('FeedBenchmarks',() => {
    const config = require('./test/config/feedbenchmarks');
    const ds = new FeedBenchmarks(config,secrets);
    let data;

    before(() => {
      return fs.readFile('./test/data/FeedBenchmarks.data')
        .then((encrypted) => {
          return new JSONEncrypter().decrypt(encrypted);
        })
        .then((_data) => {
          data = _data;
        });
    });

    it('getDateBounds',() => {
      fixFeed(data.getDateBounds.feed);
      const bounds = ds.getDateBounds(data.getDateBounds.feed);
      assert.equal(bounds.start.toISOString(),data.getDateBounds.dates.start);
      assert.equal(bounds.end.toISOString(),data.getDateBounds.dates.end);
    });

    it('filterReportFeed',() => {
      const filtered = ds.filterReportFeed(data.filterReportFeed.feed);
      assert.equal(filtered.length,data.filterReportFeed.filtered.length);
      for(var i = 0; i < filtered.length; i++) {
        assert.equal(JSON.stringify(filtered[i]),JSON.stringify(data.filterReportFeed.filtered[i]));
      }
    });

    it('processGoogleResponseBodies',() => {
      fixFeed(data.processGoogleResponseBodies.feed);
      const urls = fixUrls(data.processGoogleResponseBodies.urls);
      const consolidatedReport = ds.processGoogleResponseBodies(data.processGoogleResponseBodies.feed,urls,data.processGoogleResponseBodies.responseBodies);
      _.keys(data.processGoogleResponseBodies.consolidatedReport).forEach((url) => {
        assert(consolidatedReport[url]);
        _.keys(data.processGoogleResponseBodies.consolidatedReport[url]).forEach((date) => {
          assert(consolidatedReport[url][date]);
          assert(consolidatedReport[url][date].date);
          assert(consolidatedReport[url][date].metrics);
          assert.equal(consolidatedReport[url][date].date.toISOString(),data.processGoogleResponseBodies.consolidatedReport[url][date].date);
          _.keys(data.processGoogleResponseBodies.consolidatedReport[url][date].metrics).forEach((metric) => {
            assert.equal(consolidatedReport[url][date].metrics[metric],data.processGoogleResponseBodies.consolidatedReport[url][date].metrics[metric]);
          });
        });
      });
    });

    it('analyzeReport',() => {
      fixFeed(data.analyzeReport.feed);
      const reports = ds.analyzeReport(data.analyzeReport.feed,data.analyzeReport.report);
      assert.equal(reports.length,data.analyzeReport.reports.length);
      data.analyzeReport.reports.forEach((report,i) => {
        assert.equal(reports[i].url,report.url);
        assert.equal(reports[i].name,report.name);
        assert.equal(reports[i].startDate.toISOString(),report.startDate);
        assert(reports[i].endDate.getTime() < new Date().getTime());
        assert.equal(reports[i].data.length,report.data.length);
        report.data.forEach((dataRow,j) => {
          assert.equal(reports[i].data[j].Average,dataRow.Average);
          assert.equal(reports[i].data[j].Actual,dataRow.Actual);
          assert.equal(reports[i].data[j].Date,dataRow.Date);
        });
      });
    });
  });

  describe('FeedTable',() => {
    const config = require('./test/config/feedtable');
    const ds = new FeedTable(config,secrets);
    let data;

    before(() => {
      return fs.readFile('./test/data/FeedTable.data')
        .then((encrypted) => {
          return new JSONEncrypter().decrypt(encrypted);
        })
        .then((_data) => {
          data = _data;
        });
    });

    it('getGoogleRequestMetricsDimensions',() => {
      const array = ds.getGoogleRequestMetricsDimensions();
      assert.equal(array.length,2);
    });

    it('getGoogleRequestDimensionFilterClauses',() => {
      const populatedArray = ds.getGoogleRequestDimensionFilterClauses(1);
      assert.equal(populatedArray.length,1);

      const unPpulatedArray = ds.getGoogleRequestDimensionFilterClauses(0);
      assert.equal(unPpulatedArray.length,0);
    });

    it('generateWidgets',() => {
      const report = [];
      const widgets = ds.generateWidgets(null,report);
      assert.equal(widgets.length,1);
      assert.equal(widgets[0].data,report);
    })

    it('getDateBounds',() => {
      const a = new Date();
      const b = new Date(Date.now()+(Math.random() * 1000));
      const bounds = ds.getDateBounds(null,a,b);
      assert.equal(bounds.start,a);
      assert.equal(bounds.end,b);
    });

    it('filterReportFeed',() => {
      fixFeed(data.filterReportFeed.feed);
      const startDate = new Date(Date.parse(data.filterReportFeed.startDate));
      const endDate = new Date(Date.parse(data.filterReportFeed.endDate));
      const filtered = ds.filterReportFeed(data.filterReportFeed.feed,startDate,endDate);
      assert.equal(filtered.length,data.filterReportFeed.filtered.length);
      for(var i = 0; i < filtered.length; i++) {
        assert.equal(JSON.stringify(filtered[i]),JSON.stringify(data.filterReportFeed.filtered[i]));
      }
    });

    it('processGoogleResponseBodies',() => {
      fixFeed(data.processGoogleResponseBodies.feed);
      const urls = fixUrls(data.processGoogleResponseBodies.urls);
      const reportArray = ds.processGoogleResponseBodies(data.processGoogleResponseBodies.feed,urls,data.processGoogleResponseBodies.responseBodies);
      assert.equal(reportArray.length,data.processGoogleResponseBodies.reportArray.length);
      data.processGoogleResponseBodies.reportArray.forEach((reportRow,i) => {
        assert.equal(reportRow['URL'],reportArray[i]['URL']);
        assert.equal(reportRow['Name'],reportArray[i]['Name']);
        assert.equal(reportRow['Views'],reportArray[i]['Views']);
        assert.equal(reportRow['Unique Views'],reportArray[i]['Unique Views']);
        assert.equal(reportRow['Average Time on Page (Seconds)'],reportArray[i]['Average Time on Page (Seconds)']);
        assert.equal(reportRow['Average Scroll Depth'],reportArray[i]['Average Scroll Depth']);
      });
    });
  });

  describe('GoogleAnalytics',() => {
    const config = require('./test/config/googleanalytics');
    const ds = new FeedTable(config,secrets);
    let data;

    before(() => {
      return fs.readFile('./test/data/GoogleAnalytics.data')
        .then((encrypted) => {
          return new JSONEncrypter().decrypt(encrypted);
        })
        .then((_data) => {
          data = _data;
        });
    });

    it('buildRequests',() => {
      //TODO
    });

    it('processResponse',() => {
      //TODO
    });

    it('parseEventReport',() => {
      //TODO
    });

    it('parsePagesReport',() => {
      //TODO
    });

    it('parseGoalsReport',() => {
      //TODO
    });

    it('parseTopPagesReport',() => {
      //TODO
    });

    it('parseReferralsReport',() => {
      //TODO
    });

    it('parseOverallMetricsReport',() => {
      //TODO
    });

    it('parseTopDimensionsReport',() => {
      //TODO
    });
  });

  describe('MailchimpStats',() => {
    const config = require('./test/config/mailchimpstats');
    const ds = new MailchimpStats(config,secrets);
    let data;

    before(() => {
      return fs.readFile('./test/data/MailchimpStats.data')
        .then((encrypted) => {
          return new JSONEncrypter().decrypt(encrypted);
        })
        .then((_data) => {
          data = _data;
        });
    });

    //TODO
  });
});
