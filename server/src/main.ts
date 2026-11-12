import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { raw } from 'express'
import { AppModule } from './app.module'

async function bootstrap() {
  try {
    process.loadEnvFile()
  } catch {
    // no .env file: fall back to the real environment
  }

  const app = await NestFactory.create(AppModule)

  app.enableCors({ origin: 'http://localhost:5173' })
  app.use(raw({ type: ['video/webm', 'video/mp4'], limit: '20mb' }))
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))

  await app.listen(process.env.PORT ?? 3001)
}

bootstrap()
