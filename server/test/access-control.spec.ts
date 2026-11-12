import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { AppModule } from '../src/app.module'

process.env.DB_PATH = ':memory:'
process.env.JWT_SECRET = 'test-secret'

describe('Access control', () => {
  let app: INestApplication
  let sam: string
  let alex: string
  let jordan: string
  let requestId: string
  let callId: string

  const login = async (email: string) =>
    (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'password' }).expect(200)).body
      .token as string

  const as = (token: string) => ({
    get: (url: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token}`),
    post: (url: string) => request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token}`),
  })

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.init()

    ;[sam, alex, jordan] = await Promise.all([
      login('sam@consultant.test'),
      login('alex@client.test'),
      login('jordan@client.test'),
    ])

    const created = await as(alex)
      .post('/help-requests')
      .send({ title: 'Payout failed', description: 'The Create payout button shows an error.' })
      .expect(201)
    requestId = created.body.requestId

    callId = (await as(sam).post(`/help-requests/${requestId}/calls`).expect(201)).body.callId
  })

  afterAll(async () => {
    await app.close()
  })

  it("lets the call's client and consultant see it", async () => {
    await as(alex).get(`/calls/${callId}`).expect(200)
    await as(sam).get(`/calls/${callId}`).expect(200)
  })

  it("hides another client's request from the list", async () => {
    const mine = await as(alex).get('/help-requests').expect(200)
    const theirs = await as(jordan).get('/help-requests').expect(200)
    expect(mine.body.map((r: { requestId: string }) => r.requestId)).toContain(requestId)
    expect(theirs.body.map((r: { requestId: string }) => r.requestId)).not.toContain(requestId)
  })

  it("returns 404 when a client asks for someone else's call", async () => {
    await as(jordan).get(`/calls/${callId}`).expect(404)
    await as(jordan).get(`/calls/${callId}/transcript`).expect(404)
    await as(jordan).post(`/calls/${callId}/recording/link`).expect(404)
    await as(jordan).post(`/calls/${callId}/accept`).expect(404)
  })

  it('stops clients from doing consultant-only actions', async () => {
    await as(jordan).post(`/help-requests/${requestId}/calls`).expect(403)
    await as(alex).post(`/help-requests/${requestId}/resolve`).expect(403)
  })

  it('rejects requests without a valid token', async () => {
    await request(app.getHttpServer()).get(`/calls/${callId}`).expect(401)
    await as('not-a-token').get('/help-requests').expect(401)
  })
})
