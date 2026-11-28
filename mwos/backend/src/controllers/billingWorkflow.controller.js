const {query,getClient}=require('../config/database');
const v=require('../utils/workflowValidation');
const {linkedPatient}=require('../utils/clinicalWorkflow');
const BILL_SUMMARY = `b.id, b.bill_date, b.service_type, b.total_amount, b.payment_status,
 b.philhealth_payment_status, b.philhealth_status_updated_at, b.needs_reconciliation, b.created_at`;
const BILL_TOTALS = `b.opening_paid_amount + ledger.amount AS paid_amount,
 GREATEST(0, b.total_amount - b.opening_paid_amount - ledger.amount) AS balance`;
const BILL_SOURCE = `FROM billing b JOIN patients p ON p.id = b.patient_id
 CROSS JOIN LATERAL (
   SELECT COALESCE(SUM(bp.amount), 0) AS amount FROM billing_payments bp WHERE bp.bill_id = b.id
 ) ledger`;
const SELECT = `SELECT ${BILL_SUMMARY}, ${BILL_TOTALS}, b.patient_id, b.delivery_id,
 b.amount, b.discount, b.payment_method, b.opening_paid_amount, b.notes, b.created_by, b.updated_at,
 p.first_name || ' ' || p.last_name AS patient_name ${BILL_SOURCE}`;
const list=async(req,res,next)=>{try{const params=[],where=[];if(req.query.patientId){params.push(v.uuid(req.query.patientId));where.push('b.patient_id=$'+params.length)}if(req.query.status){params.push(v.choice(req.query.status,'status',['pending','partial','paid','waived']));where.push('b.payment_status=$'+params.length)}res.json({success:true,data:(await query(SELECT+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY b.created_at DESC',params)).rows});}catch(e){next(e)}};
const listMine = async (req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    // Ownership comes from the authenticated user, even if a patient ID is supplied.
    const result = await query(
      `SELECT ${BILL_SUMMARY}, ${BILL_TOTALS} ${BILL_SOURCE}
       WHERE p.user_id = $1 ORDER BY b.created_at DESC, b.id DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  let client;
  try {
    const bill = req.body;
    const patientId = v.uuid(bill.patientId);
    const amount = v.money(bill.amount);
    const discount = v.money(bill.discount, 'Discount', false);
    const service = v.text(bill.serviceType, 'Service', 200, true);
    const notes = v.text(bill.notes, 'Notes');
    if (discount > amount) v.fail('Discount cannot exceed the service amount.');
    client = await getClient();
    await client.query('BEGIN');
    await linkedPatient(client, patientId, { deliveries: bill.deliveryId || null });
    const result = await client.query(
      `INSERT INTO billing AS b (patient_id, delivery_id, service_type, amount, discount,
         total_amount, payment_status, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING ${BILL_SUMMARY}, b.patient_id, b.delivery_id, b.amount, b.discount,
         b.payment_method, b.opening_paid_amount, b.notes, b.created_by, b.updated_at`,
      [patientId, bill.deliveryId || null, service, amount / 100, discount / 100,
        (amount - discount) / 100, amount === discount ? 'waived' : 'pending', notes, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    next(error);
  } finally {
    client?.release();
  }
};

const updatePhilHealthStatus = async (req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  let client;
  try {
    const id = v.uuid(req.params.id);
    const status = v.choice(req.body?.status, 'PhilHealth payment status', ['not_recorded', 'processing', 'paid']);
    client = await getClient();
    await client.query('BEGIN');
    const current = (await client.query(
      'SELECT id, philhealth_payment_status, philhealth_status_updated_at FROM billing WHERE id = $1 FOR UPDATE',
      [id]
    )).rows[0];
    if (!current) v.fail('Bill not found.', 404);
    if (current.philhealth_payment_status === status) {
      await client.query('COMMIT');
      return res.json({ success: true, data: current });
    }
    const updated = (await client.query(
      `UPDATE billing SET philhealth_payment_status = $1, philhealth_status_updated_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING id, philhealth_payment_status, philhealth_status_updated_at`,
      [status, id]
    )).rows[0];
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, request_id)
       VALUES ($1, 'BILL_PHILHEALTH_STATUS_UPDATED', 'billing', $2, $3, $4, $5)`,
      [req.user.id, id, { status: current.philhealth_payment_status }, { status }, req.requestId || null]
    );
    await client.query('COMMIT');
    res.json({ success: true, data: updated });
  } catch (error) {
    if (client) await client.query('ROLLBACK');
    next(error);
  } finally {
    client?.release();
  }
};
const pay=async(req,res,next)=>{let client;try{
 const id=v.uuid(req.params.id),b=req.body,amount=v.money(b.amount),requestId=v.uuid(b.requestId,'Payment request reference');if(amount<=0)v.fail('Payment must be greater than zero.');
 const method=v.choice(b.paymentMethod,'payment method',['cash','bank_transfer','gcash','card','other']);client=await getClient();await client.query('BEGIN');
 await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[requestId]);
 const bill=(await client.query('SELECT * FROM billing WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!bill)v.fail('Bill not found.',404);
 if((await client.query('SELECT id FROM appointments WHERE billing_id=$1 AND availability_id IS NOT NULL',[id])).rows.length)v.fail('Verify this consultation payment from the appointment review screen.',409);
 const existing=(await client.query('SELECT * FROM billing_payments WHERE request_id=$1',[requestId])).rows[0];
 if(existing){if(existing.bill_id!==id||v.money(existing.amount)!==amount||existing.payment_method!==method)v.fail('Payment reference was already used with different details.',409);await client.query('COMMIT');return res.json({success:true,data:existing,duplicate:true});}
 if(bill.needs_reconciliation)v.fail('Reconcile the historical partial payment before adding another payment.',409);
 const paid=v.money(bill.opening_paid_amount)+(await client.query('SELECT COALESCE(SUM(amount),0) AS total FROM billing_payments WHERE bill_id=$1',[id])).rows.reduce((sum,r)=>sum+v.money(r.total),0);
 const total=v.money(bill.total_amount);if(bill.payment_status==='waived'||amount>total-paid)v.fail('Payment exceeds the remaining balance.');
 const payment=(await client.query('INSERT INTO billing_payments (bill_id,amount,payment_method,reference,notes,request_id,recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',[id,amount/100,method,v.text(b.reference,'Reference',150),v.text(b.notes,'Notes'),requestId,req.user.id])).rows[0];
 await client.query('UPDATE billing SET payment_status=$1,payment_method=$2,updated_at=NOW() WHERE id=$3',[paid+amount===total?'paid':'partial',method,id]);await client.query('COMMIT');res.json({success:true,data:payment});
}catch(e){if(client)await client.query('ROLLBACK');next(e)}finally{client?.release()}};
const reconcile=async(req,res,next)=>{let client;try{const id=v.uuid(req.params.id),amount=v.money(req.body.openingPaidAmount),note=v.text(req.body.note,'Reconciliation evidence',5000,true);client=await getClient();await client.query('BEGIN');const b=(await client.query('SELECT * FROM billing WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!b)v.fail('Bill not found.',404);if(!b.needs_reconciliation)v.fail('This bill does not need historical reconciliation.',409);if(amount>v.money(b.total_amount))v.fail('Opening payment exceeds the bill.');await client.query('UPDATE billing SET opening_paid_amount=$1,needs_reconciliation=false,payment_status=$2,updated_at=NOW() WHERE id=$3',[amount/100,amount===v.money(b.total_amount)?'paid':amount?'partial':'pending',id]);await client.query('INSERT INTO audit_logs (user_id,action,entity_type,entity_id,new_values) VALUES ($1,$2,$3,$4,$5)',[req.user.id,'BILL_RECONCILED','billing',id,{openingPaidAmount:amount/100,note}]);await client.query('COMMIT');res.json({success:true});}catch(e){if(client)await client.query('ROLLBACK');next(e)}finally{client?.release()}};
const detail=async(req,res,next)=>{try{const id=v.uuid(req.params.id);const bill=(await query(SELECT+' WHERE b.id=$1',[id])).rows[0];if(!bill)v.fail('Bill not found.',404);res.json({success:true,data:{bill,payments:(await query('SELECT * FROM billing_payments WHERE bill_id=$1 ORDER BY created_at',[id])).rows}});}catch(e){next(e)}};
module.exports={list,listMine,create,pay,detail,reconcile,updatePhilHealthStatus};
