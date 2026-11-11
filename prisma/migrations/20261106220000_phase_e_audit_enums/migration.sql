-- DropForeignKey
ALTER TABLE `cash_shift_movements` DROP FOREIGN KEY `cash_shift_movements_cash_shift_id_fkey`;

-- DropForeignKey
ALTER TABLE `inventory_movements` DROP FOREIGN KEY `inventory_movements_branch_id_fkey`;

-- DropForeignKey
ALTER TABLE `inventory_movements` DROP FOREIGN KEY `inventory_movements_created_by_id_fkey`;

-- DropForeignKey
ALTER TABLE `inventory_movements` DROP FOREIGN KEY `inventory_movements_inventory_item_id_fkey`;

-- DropForeignKey
ALTER TABLE `return_invoices` DROP FOREIGN KEY `return_invoices_created_by_id_fkey`;

-- DropForeignKey
ALTER TABLE `return_invoices` DROP FOREIGN KEY `return_invoices_order_id_fkey`;

-- DropIndex
DROP INDEX `inventory_movements_created_by_id_fkey` ON `inventory_movements`;

-- DropIndex
DROP INDEX `inventory_movements_inventory_item_id_fkey` ON `inventory_movements`;

-- DropIndex
DROP INDEX `return_invoices_created_by_id_fkey` ON `return_invoices`;

-- AlterTable
ALTER TABLE `cash_shift_movements` MODIFY `type` ENUM('CASH_IN', 'CASH_DROP', 'CASH_REFUND') NOT NULL;

-- AlterTable
ALTER TABLE `cash_shifts` MODIFY `status` ENUM('OPEN', 'CLOSED', 'AUDITED') NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE `delivery_drivers` MODIFY `status` ENUM('AVAILABLE', 'ON_DELIVERY', 'INACTIVE') NOT NULL DEFAULT 'AVAILABLE';

-- AlterTable
ALTER TABLE `dining_tables` MODIFY `status` ENUM('AVAILABLE', 'OCCUPIED', 'BILL_PRINTED', 'RESERVED', 'CLEANING') NOT NULL DEFAULT 'AVAILABLE',
    ALTER COLUMN `updated_at` DROP DEFAULT;

-- AlterTable
ALTER TABLE `event_bookings` MODIFY `status` ENUM('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE `inventory_movements` MODIFY `type` ENUM('SALE_POS', 'SALE_ONLINE', 'PURCHASE', 'OPERATIONAL_CONSUMPTION', 'WASTE', 'ADJUSTMENT') NOT NULL;

-- AlterTable
ALTER TABLE `offline_sale_reviews` MODIFY `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING';

-- Existing rows get a unique token. New sales set a 16-byte base64url token in application code.
-- Enum conversions abort when a stored value is outside the list (strict mode).
ALTER TABLE `orders` ADD COLUMN `tracking_token` VARCHAR(191) NULL;
UPDATE `orders`
SET `tracking_token` = REPLACE(UUID(), '-', '')
WHERE `tracking_token` IS NULL;
ALTER TABLE `orders` MODIFY `tracking_token` VARCHAR(191) NOT NULL;
ALTER TABLE `orders`
    MODIFY `source` ENUM('ONLINE', 'POS') NOT NULL DEFAULT 'ONLINE',
    MODIFY `type` ENUM('DELIVERY', 'DINE_IN', 'TAKEAWAY') NOT NULL DEFAULT 'DELIVERY',
    MODIFY `status` ENUM('PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    MODIFY `payment_status` ENUM('PENDING', 'PAID', 'PARTIALLY_PAID', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    MODIFY `payment_method` ENUM('CASH', 'CARD', 'ONLINE', 'MIXED') NOT NULL DEFAULT 'CASH';

-- AlterTable
ALTER TABLE `purchase_orders` MODIFY `status` ENUM('DRAFT', 'RECEIVED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE `table_sections` ALTER COLUMN `updated_at` DROP DEFAULT;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `actor_id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `branch_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_entity_entity_id_idx`(`entity`, `entity_id`),
    INDEX `audit_logs_actor_id_created_at_idx`(`actor_id`, `created_at`),
    INDEX `audit_logs_branch_id_created_at_idx`(`branch_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `orders_tracking_token_key` ON `orders`(`tracking_token`);

-- AddForeignKey
ALTER TABLE `return_invoices` ADD CONSTRAINT `return_invoices_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `return_invoices` ADD CONSTRAINT `return_invoices_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_branch_id_fkey` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey