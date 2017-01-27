var Pact = require('pact');
var helpersPath = __dirname + '/../../test_helpers/';
var pactProxy = require(helpersPath + '/pact_proxy.js');
var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
var getAdminUsersClient = require('../../../app/services/clients/adminusers_client');
var userFixtures = require(__dirname + '/../fixtures/user_fixtures');
var PactInteractionBuilder = require(__dirname + '/../fixtures/pact_interaction_builder').PactInteractionBuilder;

chai.use(chaiAsPromised);

const expect = chai.expect;
const FORGOTTEN_PASSWORD_PATH = '/v1/api/forgotten-passwords';
var mockPort = Math.floor(Math.random() * 65535);
var mockServer = pactProxy.create('localhost', mockPort);

var adminusersClient = getAdminUsersClient(`http://localhost:${mockPort}`);

describe('adminusers client', function () {

  var adminUsersMock;
  /**
   * Start the server and set up Pact
   */
  before(function (done) {
    mockServer.start().then(function () {
      adminUsersMock = Pact({consumer: 'Selfservice', provider: 'AdminUsers', port: mockPort});
      done()
    });
  });

  /**
   * Remove the server and publish pacts to broker
   */
  after(function (done) {
    mockServer.delete().then(() => {
      done();
    })
  });

  describe('Forgotten Password API', function () {

    context('GET forgotten password - success', () => {
      let params = {
        code: "existing-code"
      };

      let validForgottenPasswordResponse = userFixtures.validForgottenPasswordResponse(params);
      let expectedForgottenPassword = validForgottenPasswordResponse.getPlain();

      beforeEach((done) => {
        adminUsersMock.addInteraction(
          new PactInteractionBuilder(`${FORGOTTEN_PASSWORD_PATH}/${expectedForgottenPassword.code}`)
          .withState('a forgotten password entry exist')
          .withUponReceiving('forgotten password get request')
          .withResponseBody(validForgottenPasswordResponse.getPactified())
          .build()
        ).then(() => done());
      });

      afterEach((done) => {
        adminUsersMock.finalize().then(() => done())
      });

      it('should GET a forgotten password entry', function (done) {

        adminusersClient.getForgottenPassword(params).should.be.fulfilled.then(function (forgottenPassword) {
          expect(forgottenPassword.code).to.be.equal(expectedForgottenPassword.code);
          expect(forgottenPassword.date).to.be.equal(expectedForgottenPassword.date);
          expect(forgottenPassword.username).to.be.equal(expectedForgottenPassword.username);
          expect(forgottenPassword._links.length).to.be.equal(expectedForgottenPassword._links.length);

        }).should.notify(done);
      });
    });



    context('GET forgotten password API - not found', () => {
      let params = {
        code: "non-existent-code"
      };

      beforeEach((done) => {
        adminUsersMock.addInteraction(
          new PactInteractionBuilder(`${FORGOTTEN_PASSWORD_PATH}/${params.code}`)
            .withState('a valid (non-expired) forgotten password entry does not exist')
            .withUponReceiving('a forgotten password request for non existent code')
            .withStatusCode(404)
            .build()
        ).then(() => done());
      });

      afterEach((done) => {
        adminUsersMock.finalize().then(() => done())
      });

      it('should error if no valid forgotten password entry', function (done) {

        adminusersClient.getForgottenPassword(params).should.be.rejected.then(function (response) {
          expect(response.errorCode).to.equal(404);
        }).should.notify(done);
      });
    });

  });

});
