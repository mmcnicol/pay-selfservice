const nock = require('nock');
const session = require(__dirname + '/../test_helpers/mock_session.js');
const getApp = require(__dirname + '/../../server.js').getApp;
const supertest = require('supertest');
const serviceFixtures = require(__dirname + '/../fixtures/service_fixtures');
const userFixtures = require(__dirname + '/../fixtures/user_fixtures');
const paths = require(__dirname + '/../../app/paths.js');
const roles = require('../../app/utils/roles').roles;
const csrf = require('csrf');
const chai = require('chai');
const expect = chai.expect;
const chaiAsPromised = require('chai-as-promised');
const adminusersMock = nock(process.env.ADMINUSERS_URL);
const SERVICE_RESOURCE = '/v1/api/services';
const USER_RESOURCE = '/v1/api/users';

let app;
chai.use(chaiAsPromised);

const formattedPathFor = require('../../app/utils/replace_params_in_path');

describe('service users resource', function () {

  const EXTERNAL_ID_LOGGED_IN = '7d19aff33f8948deb97ed16b2912dcd3';
  const USERNAME_LOGGED_IN = 'existing-user';
  const EXTERNAL_ID_OTHER_USER = '393266e872594f1593558549caad95ec';
  const USERNAME_OTHER_USER = 'other-user';

  afterEach((done) => {
    nock.cleanAll();
    app = null;
    done();
  });

  it('get list of service users should link to my profile for my user', function (done) {

    const externalServiceId = '734rgw76jhka';
    const user = session.getUser({
      external_id: EXTERNAL_ID_LOGGED_IN,
      username: USERNAME_LOGGED_IN,
      email: USERNAME_LOGGED_IN + '@example.com',
      services: [{
        name: 'System Generated',
        external_id: externalServiceId
      }],
    });

    const serviceUsersRes = serviceFixtures.validServiceUsersResponse([{}]);

    adminusersMock.get(`${SERVICE_RESOURCE}/${externalServiceId}/users`)
      .reply(200, serviceUsersRes.getPlain());

    app = session.getAppWithLoggedInUser(getApp(), user);

    supertest(app)
      .get(formattedPathFor(paths.teamMembers.index, externalServiceId))
      .set('Accept', 'application/json')
      .expect(200)
      .expect((res) => {
        expect(res.body.number_active_members).to.equal(1);
        expect(res.body.number_admin_members).to.equal(1);
        expect(res.body['number_view-only_members']).to.equal(0);
        expect(res.body['number_view-and-refund_members']).to.equal(0);
        expect(res.body.team_members.admin.length).to.equal(1);
        expect(res.body.team_members.admin[0].username).to.equal(USERNAME_LOGGED_IN);
        expect(res.body.team_members.admin[0].link).to.equal('/my-profile');
        expect(res.body.team_members.admin[0].is_current).to.equal(true);
        expect(res.body.team_members['view-only'].length).to.equal(0);
        expect(res.body.team_members['view-and-refund'].length).to.equal(0);
      })
      .end(done);
  });

  it('should redirect to an error page when user does not belong to any service', function (done) {

    const notAllowedServiceId = '47835y3478thew';
    const user = session.getUser({
      external_id: EXTERNAL_ID_LOGGED_IN,
      username: USERNAME_LOGGED_IN,
      email: USERNAME_LOGGED_IN + '@example.com',
      services: []
    });

    app = session.getAppWithLoggedInUser(getApp(), user);

    supertest(app)
      .get(formattedPathFor(paths.teamMembers.index, notAllowedServiceId))
      .set('Accept', 'application/json')
      .expect(200)
      .expect((res) => {
        expect(res.body.message).to.equal('This user does not belong to any service. Ask your service administrator to invite you to GOV.UK Pay.');
      })
      .end(done);
  });

  it('get list of service users should link to a users view details for other users', function (done) {

    const externalServiceId = '734rgw76jhka';

    const user = session.getUser({
      external_id: EXTERNAL_ID_LOGGED_IN,
      username: USERNAME_LOGGED_IN,
      email: USERNAME_LOGGED_IN + '@example.com',
      services: [{
        name: 'System Generated',
        external_id: externalServiceId
      }],
      permissions: ['users-service:read']
    });

    const serviceUsersRes = serviceFixtures.validServiceUsersResponse([{}, {external_id: EXTERNAL_ID_OTHER_USER}]);

    adminusersMock.get(`${SERVICE_RESOURCE}/${externalServiceId}/users`)
      .reply(200, serviceUsersRes.getPlain());

    app = session.getAppWithLoggedInUser(getApp(), user);

    supertest(app)
      .get(formattedPathFor(paths.teamMembers.index, externalServiceId))
      .set('Accept', 'application/json')
      .expect(200)
      .expect((res) => {
        expect(res.body.team_members.admin[1].link).to.equal(formattedPathFor(paths.teamMembers.show, externalServiceId, EXTERNAL_ID_OTHER_USER));
      })
      .end(done);
  });

  it('view team member details', function (done) {

    const externalServiceId = '734rgw76jhka';
    const user_in_session = session.getUser({
      external_id: EXTERNAL_ID_LOGGED_IN,
      username: USERNAME_LOGGED_IN,
      email: USERNAME_LOGGED_IN + '@example.com',
      services: [{
        name: 'System Generated',
        external_id: externalServiceId
      }],
      permissions: ['users-service:read']
    });
    const user_to_view = {
      external_id: EXTERNAL_ID_OTHER_USER,
      username: USERNAME_OTHER_USER,
      services: [{
        name: 'System Generated',
        external_id: externalServiceId
      }],
      role: {"name": "view-only"}
    };
    const getUserResponse = userFixtures.validUserResponse(user_to_view);

    adminusersMock.get(`${USER_RESOURCE}/${EXTERNAL_ID_OTHER_USER}`)
      .reply(200, getUserResponse.getPlain());

    app = session.getAppWithLoggedInUser(getApp(), user_in_session);

    supertest(app)
      .get(formattedPathFor(paths.teamMembers.show, externalServiceId, EXTERNAL_ID_OTHER_USER))
      .set('Accept', 'application/json')
      .expect(200)
      .expect((res) => {
        expect(res.body.username).to.equal(USERNAME_OTHER_USER);
        expect(res.body.email).to.equal('other-user@example.com');
        expect(res.body.role).to.equal('View only');
        expect(res.body.editPermissionsLink).to.equal(formattedPathFor(paths.teamMembers.permissions, externalServiceId, EXTERNAL_ID_OTHER_USER));
        expect(res.body.removeTeamMemberLink).to.equal(formattedPathFor(paths.teamMembers.delete, externalServiceId, EXTERNAL_ID_OTHER_USER));
      })
      .end(done);
  });

  it('should show my profile', function (done) {

    const user = {
      external_id: EXTERNAL_ID_LOGGED_IN,
      username: USERNAME_LOGGED_IN,
      email: USERNAME_LOGGED_IN + '@example.com',
      telephone_number: '+447876548778',
      services: [{
        name: 'System Generated',
        external_id: '8348754ihuwk'
      }],
    };
    const user_in_session = session.getUser(user);
    const getUserResponse = userFixtures.validUserResponse(user);

    adminusersMock.get(`${USER_RESOURCE}/${EXTERNAL_ID_LOGGED_IN}`)
      .reply(200, getUserResponse.getPlain());

    app = session.getAppWithLoggedInUser(getApp(), user_in_session);

    supertest(app)
      .get('/my-profile')
      .set('Accept', 'application/json')
      .expect(200)
      .expect((res) => {
        expect(res.body.username).to.equal(user.username);
        expect(res.body.email).to.equal(user.email);
        expect(res.body['telephone_number']).to.equal(user.telephone_number);
      })
      .end(done);
  });

  it('should not show my profile without second factor', function (done) {

    const user = {
      external_id: EXTERNAL_ID_LOGGED_IN,
      username: USERNAME_LOGGED_IN,
      email: USERNAME_LOGGED_IN + '@example.com',
      telephone_number: '+447876548778',
      services: [{
        name: 'System Generated',
        external_id: '3894hewfui'
      }],
    };
    const user_in_session = session.getUser(user);
    const getUserResponse = userFixtures.validUserResponse(user);

    adminusersMock.get(`${USER_RESOURCE}/${EXTERNAL_ID_LOGGED_IN}`)
      .reply(200, getUserResponse.getPlain());

    app = session.getAppWithSessionWithoutSecondFactor(getApp(), user_in_session);

    supertest(app)
      .get('/my-profile')
      .set('Accept', 'application/json')
      .expect(302)
      .expect('Location', '/otp-login')
      .end(done);
  });

  it('should redirect to my profile when trying to access my user through team members path', function (done) {

    const externalServiceId = '3784ihwuheruw8e';
    const user_in_session = session.getUser({
      external_id: EXTERNAL_ID_LOGGED_IN,
      username: USERNAME_LOGGED_IN,
      email: USERNAME_LOGGED_IN + '@example.com',
      services: [{
        name: 'System Generated',
        external_id: externalServiceId
      }],
      permissions: ['users-service:read']
    });

    app = session.getAppWithLoggedInUser(getApp(), user_in_session);

    supertest(app)
      .get(formattedPathFor(paths.teamMembers.show, externalServiceId, EXTERNAL_ID_LOGGED_IN))
      .set('Accept', 'application/json')
      .expect(302)
      .expect('Location', "/my-profile")
      .end(done);
  });

  it('error when accessing an user from other service profile (cheeky!)', function (done) {

    const externalServiceId1 = '48753g874tg';
    const externalServiceId2 = '7huh4y7tu6g';
    const user = session.getUser({
      external_id: EXTERNAL_ID_LOGGED_IN,
      username: USERNAME_LOGGED_IN,
      email: USERNAME_LOGGED_IN + '@example.com',
      services: [{
        name: 'System Generated',
        external_id: externalServiceId1
      }],
      permissions: ['users-service:read']
    });
    const getUserResponse = userFixtures.validUserResponse({
      external_id: EXTERNAL_ID_OTHER_USER,
      username: USERNAME_OTHER_USER,
      services: [{
        name: 'System Generated',
        external_id: externalServiceId2
      }],
    });

    adminusersMock.get(`${USER_RESOURCE}/${EXTERNAL_ID_OTHER_USER}`)
      .reply(200, getUserResponse.getPlain());

    app = session.getAppWithLoggedInUser(getApp(), user);

    supertest(app)
      .get(formattedPathFor(paths.teamMembers.show, externalServiceId2, EXTERNAL_ID_OTHER_USER))
      .set('Accept', 'application/json')
      .expect(500)
      .expect((res) => {
        expect(res.body.message).to.equal('Error displaying this user of the current service');
      })
      .end(done);
  });

  it('remove a team member successfully should redirect user to team member', function (done) {

    let externalServiceId = 'service-external-id';

    let user_in_session = session.getUser({
      external_id: EXTERNAL_ID_LOGGED_IN,
      username: USERNAME_LOGGED_IN,
      email: USERNAME_LOGGED_IN + '@example.com',
      services: [{external_id: externalServiceId}],
      permissions: ['users-service:delete'],
    });

    let user_to_delete = {
      external_id: EXTERNAL_ID_OTHER_USER,
      username: USERNAME_OTHER_USER,
      role: {"name": "view-only"}
    };

    let getUserResponse = userFixtures.validUserResponse(user_to_delete);

    adminusersMock.get(`${USER_RESOURCE}/${EXTERNAL_ID_OTHER_USER}`)
      .reply(200, getUserResponse.getPlain());

    adminusersMock.delete(`${SERVICE_RESOURCE}/${externalServiceId}/users/${EXTERNAL_ID_OTHER_USER}`)
      .reply(200);


    app = session.getAppWithLoggedInUser(getApp(), user_in_session);

    supertest(app)
      .post(formattedPathFor(paths.teamMembers.delete, externalServiceId, EXTERNAL_ID_OTHER_USER))
      .send({csrfToken: csrf().create('123')})
      .expect(302)
      .expect('Location', formattedPathFor(paths.teamMembers.index, externalServiceId))
      .end(done);
  });

  it('when remove a team member fails when user does not exist should redirect user to error view with link to view team members', function (done) {

    let externalServiceId = 'service-external-id';

    let user_in_session = session.getUser({
      external_id: EXTERNAL_ID_LOGGED_IN,
      username: USERNAME_LOGGED_IN,
      email: USERNAME_LOGGED_IN + '@example.com',
      services: [{external_id: externalServiceId}],
      permissions: ['users-service:delete'],
    });

    adminusersMock.get(`${USER_RESOURCE}/${EXTERNAL_ID_OTHER_USER}`)
      .reply(404);

    app = session.getAppWithLoggedInUser(getApp(), user_in_session);

    supertest(app)
      .post(formattedPathFor(paths.teamMembers.delete, externalServiceId, EXTERNAL_ID_OTHER_USER))
      .set('Accept', 'application/json')
      .send({csrfToken: csrf().create('123')})
      .expect(200)
      .expect((res) => {
        expect(res.body.error.title).to.equal('This person has already been removed');
        expect(res.body.error.message).to.equal('This person has already been removed by another administrator.');
        expect(res.body.link.link).to.equal('/team-members');
        expect(res.body.link.text).to.equal('View all team members');
        expect(res.body.enable_link).to.equal(true);
      })
      .end(done);
  });
});
