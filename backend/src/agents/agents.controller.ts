import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { AgentsService } from './agents.service';
import { CreateAgentDto, UpdateAgentDto } from './dto/agent.dto';

/** Sales agents sell phones on credit on the shop's behalf; owners run them. */
@Controller('agents')
@Roles(UserRole.OWNER, UserRole.MANAGER)
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Post()
  create(@Body() dto: CreateAgentDto) {
    return this.agents.create(dto);
  }

  @Get()
  list() {
    return this.agents.list();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.agents.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAgentDto) {
    return this.agents.update(id, dto);
  }
}
