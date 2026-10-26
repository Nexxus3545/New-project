import React from 'react'
import { Link } from 'react-router-dom'
import AppIcon from './AppIcon'
import { clinicContact } from '../../utils/clinicContact'

export default function ClinicContact() {
  return <section id="contact" className="clinic-contact-section clinic-container" aria-labelledby="clinic-contact-title">
    <div className="clinic-section-heading">
      <p className="clinic-eyebrow">Before you visit</p>
      <h2 id="clinic-contact-title">Hours & contact</h2>
      <p>Know when the clinic is open and how to reach us. Confirm your service and consultation schedule before travelling.</p>
    </div>
    <div className="clinic-contact-layout">
      <article className="clinic-hours-card" aria-labelledby="clinic-hours-title">
        <span className="clinic-icon-circle"><AppIcon name="clock" /></span>
        <h3 id="clinic-hours-title">Working hours</h3>
        <p className="clinic-hours-highlight">{clinicContact.hours}</p>
        <dl className="clinic-hours-schedule"><div><dt>{clinicContact.days}</dt><dd>24 hours daily</dd></div></dl>
        <p className="clinic-contact-timezone">{clinicContact.timezone}</p>
        <p className="clinic-hours-note">Opening hours are not a confirmed consultation slot. Please check the schedule for your preferred service and provider.</p>
        <Link className="clinic-quiet-link" to="/portal?intent=appointment">Request an appointment <AppIcon name="arrowRight" /></Link>
      </article>
      <div className="clinic-contact-details">
        <div className="clinic-contact-details-heading"><h3>Get in touch</h3><span>Temporary contact details</span></div>
        <address className="clinic-contact-methods">
          <div><AppIcon name="phone" /><div><span className="clinic-contact-label">Phone</span><a href={clinicContact.phoneHref}>{clinicContact.phone}</a><p>Tap to call the clinic contact.</p></div></div>
          <div><AppIcon name="mail" /><div><span className="clinic-contact-label">Email</span><a href={`mailto:${clinicContact.email}`}>{clinicContact.email}</a><p>Temporary email for general inquiries.</p></div></div>
          <div><AppIcon name="messages" /><div><span className="clinic-contact-label">Facebook</span><a href={clinicContact.facebook} target="_blank" rel="noopener noreferrer">Visit the clinic Facebook page <AppIcon name="externalLink" /><span className="clinic-visually-hidden"> (opens in a new tab)</span></a><p>Ask about services and visit schedules.</p></div></div>
          <div><AppIcon name="emergency" /><div><span className="clinic-contact-label">Location</span><strong>{clinicContact.name}</strong><p>{clinicContact.address}</p><a className="clinic-contact-map" href={clinicContact.mapSearch} target="_blank" rel="noopener noreferrer">Find the clinic on Google Maps <AppIcon name="externalLink" /><span className="clinic-visually-hidden"> (opens in a new tab)</span></a></div></div>
        </address>
        <p className="clinic-contact-privacy">For personal health details or records, use <Link to="/portal">the secure patient portal</Link> instead of public posts or general email. These contact channels do not confirm emergency dispatch.</p>
      </div>
    </div>
  </section>
}
