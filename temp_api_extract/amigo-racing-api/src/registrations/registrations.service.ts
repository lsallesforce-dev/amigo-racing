import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RegistrationsService {
  constructor(private prisma: PrismaService) {}

  // Cria uma inscrição
  async create(data: {
    userId: string;
    eventId: string;
    categoryId: string;
    vehicleId: string;
  }) {
    return this.prisma.registration.create({
      data: {
        userId: data.userId,
        eventId: data.eventId,
        categoryId: data.categoryId,
        vehicleId: data.vehicleId,
      },
    });
  }

  // Lista todas as inscrições com os dados relacionados
  async findAll() {
    return this.prisma.registration.findMany({
      include: {
        user: true,
        event: true,
        category: true,
        vehicle: true,
      },
    });
  }
}