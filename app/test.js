const assert = require('assert');
const reporter = require('./lib/reporter');
const server = require('./index');
const settings = require('./settings.js');
const async = require('async');
const chai = require('chai');
const should = chai.should();
const chaiHttp = require('chai-http');

chai.use(chaiHttp);

describe('Analytics Dashboard',function() {

  describe('Reporter Functions',function() {

    describe('formatDate',function() {
      it('Formats dates under 10',function() {
        const date = new Date(2017,0,30);
        const formattedDate = reporter.testable.formatDate(date);
        assert.equal(formattedDate,'2017-01-30T00:00:00.000Z');
      });
      it('Formats dates over 10',function() {
        const date = new Date(2017,9,30);
        const formattedDate = reporter.testable.formatDate(date);
        assert.equal(formattedDate,'2017-10-30T00:00:00.000Z');
      });
    });

    describe('parseReport',function() {
      it('Properly computes benchmarks',function(done) {
        const testData = require('./testData');
        testData.feed.forEach(function(item) {
          item.pubdate = new Date(Date.parse(item.pubdate));
        });
        const days = 30;
        const posts = 25;
        reporter.testable.parseReport(posts,days,testData.feed,testData.report,function(err,report) {
          assert(!err);
          assert.equal(posts,report.length);
          report.forEach(function(reportRow,i) {
            const counterpartRow = testData.finalReport[i];
            assert.equal(reportRow.url,counterpartRow.url);
            assert.equal(reportRow.startDate.getTime(),Date.parse(counterpartRow.startDate));
            ['averages','scores'].forEach(function(statType) {
              for(const metric in reportRow[statType].daily) {
                assert.equal(days,reportRow[statType].daily[metric].length);
                assert.equal(reportRow[statType].daily[metric].length,counterpartRow[statType].daily[metric].length);
                reportRow[statType].daily[metric].forEach(function(stat,j) {
                  const counterpartStat = counterpartRow[statType].daily[metric][j];
                  assert.strictEqual(stat,counterpartStat);
                });
              }
              for(const metric in reportRow[statType].cumulative) {
                assert.equal(reportRow[statType].cumulative[metric],counterpartRow[statType].cumulative[metric]);
              }
            });
            for(const metric in reportRow.actuals) {
              assert.equal(days,reportRow.actuals[metric].length);
              assert.equal(reportRow.actuals[metric].length,counterpartRow.actuals[metric].length);
              reportRow.actuals[metric].forEach(function(stat,j) {
                const counterpartStat = counterpartRow.actuals[metric][j];
                assert.strictEqual(stat,counterpartStat);
              });
            }
          });
          done();
        });
      });
    });

    describe('getDateBounds',function() {
      it('Finds the upper and lower date bounds',function() {
        const feed = [
          {
            'pubdate': new Date(2017,9,1)
          },
          {
            'pubdate': new Date(2017,3,15)
          },
          {
            'pubdate': new Date(2016,11,20)
          },
          {
            'pubdate': new Date(2017,2,1)
          }
        ];
        const bounds = reporter.testable.getDateBounds(feed);
        assert.equal(bounds.start.getTime(),feed[2].pubdate.getTime());
        assert.equal(bounds.end.getTime(),feed[0].pubdate.getTime());
      });
    });

    describe('filterReportFeed',function() {
      it('Properly trims the array',function(done) {
        const feed = [0,1,2,3,4,5];
        const trim = 3;
        reporter.testable.filterReportFeed(feed,trim,function(err,trimmedFeed) {
          assert.equal(trimmedFeed.length,trim);
          done();
        });
      });
      it('Throws an error for a short array',function(done) {
        const feed = [0,1,2,3,4,5];
        const trim = 10;
        reporter.testable.filterReportFeed(feed,trim,function(err,trimmedFeed) {
          assert(err);
          assert(!trimmedFeed);
          done();
        });
      });
    });

    describe('convertFeedToUrls',function() {
      it('Generates an array of URL objects',function() {
        const feed = [
          {
            'link': 'http://casefoundation.org/'
          },
          {
            'link': 'https://twitter.com/casefoundation'
          }
        ];
        const urls = reporter.testable.convertFeedToUrls(feed);
        assert.equal(feed.length,urls.length);
        urls.forEach(function(url,i) {
          assert.equal(url.href,feed[i].link);
        });
      });
    });

    describe('sortFeed',function() {
      it('Sorts the feed descending',function() {
        const date1 = new Date(2017,9,1);
        const date2 = new Date(2017,3,15);
        const date3 = new Date(2017,2,1);
        const date4 = new Date(2016,11,20);
        const sortedFeed = [
          {
            'pubdate': date1
          },
          {
            'pubdate': date2
          },
          {
            'pubdate': date3
          },
          {
            'pubdate': date4
          }
        ]
        const feed = [
          {
            'pubdate': date4
          },
          {
            'pubdate': date2
          },
          {
            'pubdate': date3
          },
          {
            'pubdate': date1
          }
        ];
        reporter.testable.sortFeed(feed);
        feed.forEach(function(item,i) {
          assert.equal(item.pubdate.getTime(),sortedFeed[i].pubdate.getTime());
        });
      });
    });

  });

  describe('Feed API',function() {
    beforeEach(function(done) {
      async.waterfall([
        function(next) {
          settings.init('./settings.test.json',{},next);
        },
        function(next) {
          settings.commit(next);
        }
      ],done);
    });

    afterEach(function(done) {
      settings._ = {};
      settings.commit(done);
    })

    it('GET /api/feed',function(done) {
      settings._.feeds = [
        {
          "name": "Test Name",
          "url": "http://casefoundation.org/feed/",
          "nPosts": 5,
          "nDays": 5,
          "googleAccount": {
            "account": "dfsdfsvsdv",
            "property": "sfsdfsdfsfsg",
            "profile": "nvbnvbnvbn"
          },
          "id": "24f35fe0-e723-11e6-bafc-3daaebff386e"
        }
      ];
      chai.request(server)
        .get('/api/feed')
        .end(function(err,res) {
          if (err) {
            done(err);
          } else {
            res.should.have.status(200);
            res.body.should.have.lengthOf(settings._.feeds.length);
            res.body.should.be.a('array');
            res.body[0].should.be.a('object');
            ['name','url','nPosts','nDays','id'].forEach(function(prop) {
              res.body[0].should.have.property(prop);
              res.body[0][prop].should.equal(settings._.feeds[0][prop]);
            });
            res.body[0].googleAccount.should.be.a('object');
            ['account','property','profile'].forEach(function(prop) {
              res.body[0].googleAccount.should.have.property(prop);
              res.body[0].googleAccount[prop].should.equal(settings._.feeds[0].googleAccount[prop]);
            });
            done();
          }
        });
    });

    it('GET /api/feed/:id',function(done) {
      settings._.feeds = [
        {
          "name": "Test Name",
          "url": "http://casefoundation.org/feed/",
          "nPosts": 5,
          "nDays": 5,
          "googleAccount": {
            "account": "dfsdfsvsdv",
            "property": "sfsdfsdfsfsg",
            "profile": "nvbnvbnvbn"
          },
          "id": "24f35fe0-e723-11e6-bafc-3daaebff386e"
        }
      ];
      chai.request(server)
        .get('/api/feed/24f35fe0-e723-11e6-bafc-3daaebff386e')
        .end(function(err,res) {
          if (err) {
            done(err);
          } else {
            res.should.have.status(200);
            res.body.should.be.a('object');
            ['name','url','nPosts','nDays','id'].forEach(function(prop) {
              res.body.should.have.property(prop);
              res.body[prop].should.equal(settings._.feeds[0][prop]);
            });
            res.body.googleAccount.should.be.a('object');
            ['account','property','profile'].forEach(function(prop) {
              res.body.googleAccount.should.have.property(prop);
              res.body.googleAccount[prop].should.equal(settings._.feeds[0].googleAccount[prop]);
            });
            done();
          }
        });
    });

    it('POST /api/feed',function(done) {
      const item = {
        "name": "Test Name",
        "url": "http://casefoundation.org/feed/",
        "nPosts": 5,
        "nDays": 5,
        "googleAccount": {
          "account": "dfsdfsvsdv",
          "property": "sfsdfsdfsfsg",
          "profile": "nvbnvbnvbn"
        }
      };
      chai.request(server)
        .post('/api/feed')
        .send(item)
        .end(function(err,res) {
          if (err) {
            done(err);
          } else {
            assert.equal(settings._.feeds.length,1);
            res.should.have.status(200);
            res.body.should.be.a('object');
            res.body.should.have.property('id');
            ['name','url','nPosts','nDays'].forEach(function(prop) {
              res.body.should.have.property(prop);
              res.body[prop].should.equal(item[prop]);
            });
            res.body.googleAccount.should.be.a('object');
            ['account','property','profile'].forEach(function(prop) {
              res.body.googleAccount.should.have.property(prop);
              res.body.googleAccount[prop].should.equal(item.googleAccount[prop]);
            });
            done();
          }
        });
    });

    it('PUT /api/feed/:id',function(done) {
      settings._.feeds = [
        {
          "name": "Test Name",
          "url": "http://casefoundation.org/feed/",
          "nPosts": 5,
          "nDays": 5,
          "googleAccount": {
            "account": "dfsdfsvsdv",
            "property": "sfsdfsdfsfsg",
            "profile": "nvbnvbnvbn"
          },
          "id": "24f35fe0-e723-11e6-bafc-3daaebff386e"
        }
      ];
      const item = {
        "name": "Test Name 1",
        "url": "http://google.com",
        "nPosts": 4,
        "nDays": 3,
        "googleAccount": {
          "account": "vbcvbcvb",
          "property": "cvbcvbc",
          "profile": "dsvcvxcv"
        },
        "id": "24f35fe0-e723-11e6-bafc-3daaebff386e"
      }
      chai.request(server)
        .put('/api/feed/24f35fe0-e723-11e6-bafc-3daaebff386e')
        .send(item)
        .end(function(err,res) {
          if (err) {
            done(err);
          } else {
            assert.equal(settings._.feeds.length,1);
            res.should.have.status(200);
            res.body.should.be.a('object');
            res.body.should.have.property('id');
            ['name','url','nPosts','nDays','id'].forEach(function(prop) {
              res.body.should.have.property(prop);
              res.body[prop].should.equal(item[prop]);
            });
            res.body.googleAccount.should.be.a('object');
            ['account','property','profile'].forEach(function(prop) {
              res.body.googleAccount.should.have.property(prop);
              res.body.googleAccount[prop].should.equal(item.googleAccount[prop]);
            });
            done();
          }
        });
    });

    it('DELETE /api/feed/:id',function(done) {
      settings._.feeds = [
        {
          "name": "Test Name",
          "url": "http://casefoundation.org/feed/",
          "nPosts": 5,
          "nDays": 5,
          "googleAccount": {
            "account": "dfsdfsvsdv",
            "property": "sfsdfsdfsfsg",
            "profile": "nvbnvbnvbn"
          },
          "id": "24f35fe0-e723-11e6-bafc-3daaebff386e"
        }
      ];
      chai.request(server)
        .delete('/api/feed/24f35fe0-e723-11e6-bafc-3daaebff386e')
        .end(function(err,res) {
          if (err) {
            done(err);
          } else {
            assert.equal(settings._.feeds.length,0);
            res.should.have.status(200);
            done();
          }
        });
    });
  });
});
