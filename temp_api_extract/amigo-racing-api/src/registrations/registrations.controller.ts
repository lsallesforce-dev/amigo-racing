import { Controller, Get, Post, Body } from '@nestjs/common';
import { RegistrationsService } from './registrations.service';

@Controller('registrations')
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  // Endpoint para criar inscrição
  @Post()
  async create(@Body() data: any) {
    return this.registrationsService.create(data);
  }

  // Endpoint para listar inscrições
  @Get()
  async findAll() {
    return this.registrationsService.findAll();
  }
}