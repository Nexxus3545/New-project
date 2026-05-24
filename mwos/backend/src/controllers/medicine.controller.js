const { query } = require('../config/database');

const MEDICINE_CATALOG = [
  {
    match: /oxytocin/i,
    image: '/medicine-catalog/oxytocin.svg',
    purpose: 'Supports labor induction and helps prevent or control postpartum bleeding.',
    usageInstructions: 'Administer only under clinician supervision with continuous maternal monitoring.',
    usageSteps: [
      'Verify the clinician order, dose, and indication before preparation.',
      'Monitor uterine activity, blood pressure, and fetal response during administration.',
      'Document the route, timing, and patient response immediately after use.',
    ],
    precautions: 'Use carefully in patients with uterine hyperstimulation risk or contraindications to induced labor.',
    sideEffects: 'May cause uterine cramping, nausea, headache, or blood pressure changes.',
    requiresPrescription: true,
  },
  {
    match: /misoprostol/i,
    image: '/medicine-catalog/misoprostol.svg',
    purpose: 'Supports cervical ripening and postpartum bleeding management when prescribed.',
    usageInstructions: 'Follow the exact clinician-prescribed dose, timing, and route of administration.',
    usageSteps: [
      'Confirm the ordered dose and prescribed route before release or administration.',
      'Give the medicine exactly as instructed by the maternity care team.',
      'Observe for excessive cramping, bleeding changes, or fever and escalate concerns quickly.',
    ],
    precautions: 'Avoid unsupervised use during pregnancy and follow only authorized care-team instructions.',
    sideEffects: 'Can cause cramping, diarrhea, chills, nausea, or temporary fever.',
    requiresPrescription: true,
  },
  {
    match: /magnesium sulfate/i,
    image: '/medicine-catalog/magnesium-sulfate.svg',
    purpose: 'Helps prevent seizures in patients with severe preeclampsia or eclampsia risk.',
    usageInstructions: 'Give only in monitored care settings with reflex, breathing, and urine output checks.',
    usageSteps: [
      'Review the loading and maintenance dose ordered by the clinician.',
      'Monitor respiratory rate, patellar reflexes, and urine output during therapy.',
      'Keep the antidote protocol and emergency escalation pathway ready at the bedside.',
    ],
    precautions: 'Use with extra caution in renal impairment or respiratory depression risk.',
    sideEffects: 'May cause flushing, warmth, nausea, muscle weakness, or slowed breathing if levels rise.',
    requiresPrescription: true,
  },
  {
    match: /mefenamic/i,
    image: '/medicine-catalog/mefenamic-acid.svg',
    purpose: 'Provides short-term relief for pain, cramping, and inflammatory discomfort.',
    usageInstructions: 'Take after meals with water and only for the prescribed short-term interval.',
    usageSteps: [
      'Take the dose after food to reduce stomach irritation.',
      'Drink a full glass of water with each dose unless told otherwise.',
      'Stop and report severe stomach pain, allergy symptoms, or unusual bleeding.',
    ],
    precautions: 'Use cautiously in patients with ulcer, kidney, or bleeding-history concerns.',
    sideEffects: 'May cause stomach upset, dizziness, heartburn, or nausea.',
    requiresPrescription: false,
  },
  {
    match: /antibiotic/i,
    image: '/medicine-catalog/antibiotics.svg',
    purpose: 'Targets bacterial infections based on the prescribing clinician guidance.',
    usageInstructions: 'Complete the full prescribed course and do not skip doses.',
    usageSteps: [
      'Take the medicine at evenly spaced times each day.',
      'Complete the full course even if symptoms improve early.',
      'Report rash, breathing difficulty, or severe diarrhea right away.',
    ],
    precautions: 'Check allergy history carefully before dispensing or taking the medicine.',
    sideEffects: 'May cause nausea, loose stool, rash, or stomach discomfort depending on the antibiotic.',
    requiresPrescription: true,
  },
];

const getCatalogDefaults = (itemName = '') =>
  MEDICINE_CATALOG.find((entry) => entry.match.test(itemName)) || {
    image: '/medicine-catalog/default.svg',
    purpose: null,
    usageInstructions: null,
    usageSteps: [],
    precautions: null,
    sideEffects: null,
    requiresPrescription: false,
  };

const toAssetUrl = (req, storedPath) => {
  if (!storedPath) return null;
  if (/^https?:\/\//i.test(storedPath) || storedPath.startsWith('/medicine-catalog/')) return storedPath;
  return `${req.protocol}://${req.get('host')}${storedPath}`;
};

const toNullableString = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

const toNullableNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const toBoolean = (value, fallback = false) => {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
};

const parseUsageSteps = (value, fallback = []) => {
  if (value === undefined) return fallback;
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  const text = String(value).trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {}

  return text
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const deriveAvailabilityStatus = ({ quantity, reorderLevel, explicitStatus, fallback = 'available' }) => {
  if (explicitStatus) return explicitStatus;
  if (!Number.isFinite(quantity)) return fallback;
  if (quantity <= 0) return 'out_of_stock';
  if (Number.isFinite(reorderLevel) && quantity <= reorderLevel) return 'limited';
  return 'available';
};

const mapMedicine = (req, row) => {
  const catalog = getCatalogDefaults(row.item_name);
  const usageSteps = Array.isArray(row.usage_steps) && row.usage_steps.length
    ? row.usage_steps
    : catalog.usageSteps;

  return {
    ...row,
    image_url: toAssetUrl(req, row.image_url) || catalog.image,
    purpose: row.purpose || catalog.purpose,
    usage_instructions: row.usage_instructions || catalog.usageInstructions || row.description || catalog.purpose,
    usage_steps: usageSteps,
    precautions: row.precautions || catalog.precautions,
    side_effects: row.side_effects || catalog.sideEffects,
    requires_prescription: Boolean(row.requires_prescription || catalog.requiresPrescription),
  };
};

const getAll = async (req, res, next) => {
  try {
    const result = await query(
      `SELECT DISTINCT ON (LOWER(item_name), COALESCE(LOWER(dosage), ''))
         *
       FROM inventory
       WHERE category = 'medication'
       ORDER BY
         LOWER(item_name),
         COALESCE(LOWER(dosage), ''),
         (
           CASE WHEN image_url IS NOT NULL THEN 1 ELSE 0 END +
           CASE WHEN purpose IS NOT NULL THEN 1 ELSE 0 END +
           CASE WHEN usage_instructions IS NOT NULL THEN 1 ELSE 0 END +
           CASE WHEN description IS NOT NULL THEN 1 ELSE 0 END
         ) DESC,
         updated_at DESC,
         created_at DESC`
    );

    const medicines = result.rows
      .map((row) => mapMedicine(req, row))
      .sort((left, right) => left.item_name.localeCompare(right.item_name));

    res.json({ success: true, data: medicines });
  } catch (err) {
    next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const {
      itemName,
      unit,
      quantity,
      reorderLevel,
      expiryDate,
      supplier,
      unitCost,
      notes,
      description,
      purpose,
      dosage,
      usageInstructions,
      usageSteps,
      precautions,
      sideEffects,
      requiresPrescription,
      availabilityStatus,
    } = req.body;

    if (!itemName) {
      return res.status(400).json({ success: false, message: 'itemName is required' });
    }

    const duplicate = await query(
      `SELECT id
       FROM inventory
       WHERE category = 'medication'
         AND LOWER(item_name) = LOWER($1)
         AND COALESCE(LOWER(dosage), '') = COALESCE(LOWER($2), '')
       LIMIT 1`,
      [itemName.trim(), toNullableString(dosage)]
    );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'This medicine already exists. Open the current entry and update it instead.',
      });
    }

    const quantityValue = toNullableNumber(quantity) ?? 0;
    const reorderLevelValue = toNullableNumber(reorderLevel) ?? 10;
    const unitCostValue = toNullableNumber(unitCost);
    const computedAvailability = deriveAvailabilityStatus({
      quantity: quantityValue,
      reorderLevel: reorderLevelValue,
      explicitStatus: toNullableString(availabilityStatus),
    });

    const result = await query(
      `INSERT INTO inventory (
         item_name, category, description, purpose, dosage, usage_instructions, usage_steps,
         precautions, side_effects, requires_prescription, image_url, availability_status,
         unit, quantity, reorder_level, expiry_date, supplier, unit_cost, notes, updated_by
       ) VALUES ($1,'medication',$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        itemName.trim(),
        toNullableString(description),
        toNullableString(purpose),
        toNullableString(dosage),
        toNullableString(usageInstructions),
        JSON.stringify(parseUsageSteps(usageSteps)),
        toNullableString(precautions),
        toNullableString(sideEffects),
        toBoolean(requiresPrescription),
        req.file ? `/uploads/medicine-images/${req.file.filename}` : null,
        computedAvailability,
        toNullableString(unit) || 'box',
        quantityValue,
        reorderLevelValue,
        expiryDate || null,
        toNullableString(supplier),
        unitCostValue,
        toNullableString(notes),
        req.user.id,
      ]
    );

    res.status(201).json({ success: true, data: mapMedicine(req, result.rows[0]) });
  } catch (err) {
    next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      itemName,
      unit,
      quantity,
      reorderLevel,
      expiryDate,
      supplier,
      unitCost,
      notes,
      description,
      purpose,
      dosage,
      usageInstructions,
      usageSteps,
      precautions,
      sideEffects,
      requiresPrescription,
      availabilityStatus,
    } = req.body;

    const existing = await query('SELECT * FROM inventory WHERE id = $1 AND category = $2', [id, 'medication']);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Medicine not found' });
    }

    const current = existing.rows[0];
    const nextItemName = itemName?.trim() || current.item_name;
    const nextDosage = dosage !== undefined ? toNullableString(dosage) : current.dosage;

    const duplicate = await query(
      `SELECT id
       FROM inventory
       WHERE category = 'medication'
         AND id <> $1
         AND LOWER(item_name) = LOWER($2)
         AND COALESCE(LOWER(dosage), '') = COALESCE(LOWER($3), '')
       LIMIT 1`,
      [id, nextItemName, nextDosage]
    );

    if (duplicate.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Another medicine already uses that name and dosage. Merge or rename the entry first.',
      });
    }

    const imageUrl = req.file ? `/uploads/medicine-images/${req.file.filename}` : current.image_url;
    const quantityValue = quantity !== undefined ? (toNullableNumber(quantity) ?? 0) : current.quantity;
    const reorderLevelValue = reorderLevel !== undefined ? (toNullableNumber(reorderLevel) ?? 10) : current.reorder_level;
    const computedAvailability = deriveAvailabilityStatus({
      quantity: quantityValue,
      reorderLevel: reorderLevelValue,
      explicitStatus: toNullableString(availabilityStatus),
      fallback: current.availability_status || 'available',
    });

    const result = await query(
      `UPDATE inventory
       SET item_name = $1,
           description = $2,
           purpose = $3,
           dosage = $4,
           usage_instructions = $5,
           usage_steps = $6::jsonb,
           precautions = $7,
           side_effects = $8,
           requires_prescription = $9,
           image_url = $10,
           availability_status = $11,
           unit = $12,
           quantity = $13,
           reorder_level = $14,
           expiry_date = $15,
           supplier = $16,
           unit_cost = $17,
           notes = $18,
           updated_by = $19,
           updated_at = NOW()
       WHERE id = $20
       RETURNING *`,
      [
        nextItemName,
        description !== undefined ? toNullableString(description) : current.description,
        purpose !== undefined ? toNullableString(purpose) : current.purpose,
        nextDosage,
        usageInstructions !== undefined ? toNullableString(usageInstructions) : current.usage_instructions,
        JSON.stringify(parseUsageSteps(usageSteps, current.usage_steps || [])),
        precautions !== undefined ? toNullableString(precautions) : current.precautions,
        sideEffects !== undefined ? toNullableString(sideEffects) : current.side_effects,
        toBoolean(requiresPrescription, current.requires_prescription),
        imageUrl,
        computedAvailability,
        unit !== undefined ? (toNullableString(unit) || 'box') : current.unit,
        quantityValue,
        reorderLevelValue,
        expiryDate !== undefined ? (expiryDate || null) : current.expiry_date,
        supplier !== undefined ? toNullableString(supplier) : current.supplier,
        unitCost !== undefined ? toNullableNumber(unitCost) : current.unit_cost,
        notes !== undefined ? toNullableString(notes) : current.notes,
        req.user.id,
        id,
      ]
    );

    res.json({ success: true, data: mapMedicine(req, result.rows[0]) });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAll,
  create,
  update,
};
