import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CategoriesService } from './categories.service';
import {
  CategoryResponseDto,
  CreateCategoryDto,
  toCategoryResponse,
  UpdateCategoryDto,
} from './dto/category.dto';

@ApiTags('Categories')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List your categories (A to Z) with idea counts' })
  async findAll(@CurrentUser() user: AuthUser): Promise<CategoryResponseDto[]> {
    const rows = await this.categories.findAllWithCounts(user.id);
    return rows.map(({ category, ideaCount }) => ({
      ...toCategoryResponse(category),
      ideaCount,
    }));
  }

  @Post()
  @ApiOperation({ summary: 'Create a category' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return toCategoryResponse(await this.categories.create(user.id, dto));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename or recolour a category' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryResponseDto> {
    return toCategoryResponse(await this.categories.update(user.id, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a category (its ideas stay, uncategorized)',
  })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.categories.remove(user.id, id);
  }
}
