import React from 'react'
import { Link } from 'react-router-dom'
import { PickupRequests } from '../../components/common/CoordinationWorkflows'
export default function PatientCheckoutSuccessPage(){return <div className="space-y-5"><h1 className="page-title">My pharmacy requests</h1><PickupRequests/><Link className="btn-secondary" to="/my/pharmacy">Browse medicines</Link></div>}
