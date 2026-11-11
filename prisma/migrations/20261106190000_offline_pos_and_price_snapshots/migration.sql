-- AlterTable
ALTER TABLE `restaurant_settings` ADD COLUMN `catalog_version` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `offline_order_number` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `catalog_price_snapshots` (
    `id` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `entity_type` VARCHAR(191) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `price_minor` INTEGER NOT NULL,
    `valid_from` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `valid_to` DATETIME(3) NULL,

    INDEX `catalog_price_snapshots_version_idx`(`version`),
    INDEX `catalog_price_snapshots_entity_type_entity_id_valid_from_valid_to_idx`(`entity_type`, `entity_id`, `valid_from`, `valid_to`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `offline_sale_reviews` (
    `id` VARCHAR(191) NOT NULL,
    `order_number` VARCHAR(191) NOT NULL,
    `branch_id` VARCHAR(191) NOT NULL,
    `cashier_id` VARCHAR(191) NOT NULL,
    `cash_shift_id` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `reason` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolved_at` DATETIME(3) NULL,
    `resolved_by_id` VARCHAR(191) NULL,

    INDEX `offline_sale_reviews_branch_id_status_idx`(`branch_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
