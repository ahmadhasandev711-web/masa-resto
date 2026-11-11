-- CreateTable
CREATE TABLE `document_sequences` (
    `key` VARCHAR(191) NOT NULL,
    `value` INTEGER NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill initial sequences
INSERT INTO `document_sequences` (`key`, `value`)
SELECT 'ORDER', COALESCE(MAX(CAST(`order_number` AS UNSIGNED)), 1000)
FROM `orders`
WHERE `order_number` REGEXP '^[0-9]+$'
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

INSERT INTO `document_sequences` (`key`, `value`)
SELECT 'PO', COALESCE(MAX(CAST(SUBSTRING_INDEX(`order_number`, '-', -1) AS UNSIGNED)), 1000)
FROM `purchase_orders`
WHERE `order_number` LIKE 'PO-%'
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

INSERT INTO `document_sequences` (`key`, `value`)
SELECT 'STL', COALESCE(COUNT(*), 0)
FROM `driver_settlements`
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

INSERT INTO `document_sequences` (`key`, `value`)
SELECT 'RET', COALESCE(COUNT(*), 0)
FROM `return_invoices`
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);
