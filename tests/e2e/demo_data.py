# Fictional demo data for screenshots and smoke tests. Company names are invented.
import datetime as dt
now = dt.datetime(2026, 10, 10, 12, 0, tzinfo=dt.timezone.utc)
def iso(days): return (now - dt.timedelta(days=days)).isoformat().replace('+00:00','Z')
def app(i, title, company, loc, status, days, score, cat, plat, salary=None, wt=None, hist=None, tools=None, matched=None, basic=None, missing=None, nxt=''):
    hist = hist or [status]
    h = []
    for k, s in enumerate(hist):
        h.append({'status': s, 'at': iso(days - k*3)})
    return {
      'id': f'demo{i}', 'ticket': f'APP-{i:04d}', 'title': title, 'company': company, 'location': loc,
      'url': f'https://example.com/jobs/{i}', 'urlKey': f'example.com/jobs/{i}', 'platform': plat, 'category': cat,
      'workTypes': wt or ['Full-time', 'Hybrid'], 'salaryText': salary or '', 'salary': None,
      'appliedAt': iso(days), 'status': status, 'history': h,
      'tools': tools or [], 'details': [], 'benefits': [], 'contacts': [], 'followUps': [],
      'chance': {'score': score, 'label': 'High' if score>=70 else 'Medium' if score>=50 else 'Low', 'tools': tools or [], 'matched': matched or [], 'basic': basic or [], 'missing': missing or [], 'similar': [], 'keyMissing': [], 'reasons': [{'text': 'Skills: demo data', 'delta': 30, 'max': 50}]},
      'description': '', 'notes': '', 'nextDate': nxt, 'offer': None,
      'createdAt': iso(days), 'updatedAt': iso(days),
    }
APPS = [
  app(1,'Software Engineering Intern','Northbeam Labs','London','interview1',4,78,'Software Developer','LinkedIn','£24,000 per annum',['Internship','Hybrid'],['applied','screening','interview1'],['Python','REST APIs','PostgreSQL','Git','Docker'],['Python','Git'],['REST APIs','PostgreSQL'],['Docker'], nxt='2026-10-13'),
  app(2,'AI Engineer Intern','Quillstone AI','London','screening',9,64,'AI / Machine Learning','Wellfound','',['Internship','On-site'],['applied','screening'],['Python','PyTorch','LLMs / RAG','Docker'],['Python'],['LLMs / RAG'],['PyTorch','Docker']),
  app(3,'Junior Python Developer (part-time)','Fernhill Digital','Cambridge','applied',12,71,'Software Developer','Indeed','£14 - £16 per hour',['Part-time','Hybrid'],None,['Python','Django','SQL','Git'],['Python','SQL','Git'],[],['Django']),
  app(4,'Graduate Data Engineer','Harbour & Vale','London','rejected',20,42,'Data / Analyst','Reed','£30,000 per annum',['Full-time','On-site'],['applied','rejected'],['Python','SQL','AWS','Airflow'],['Python','SQL'],[],['AWS']),
  app(5,'Placement Student: Platform Engineering','Copperline Systems','Stevenage','offer',26,74,'Cloud / DevOps','Company website','£22,500 per annum',['Graduate / Placement','Hybrid'],['applied','screening','test','interview1','offer'],['Linux','Docker','Python','CI/CD'],['Linux','Python'],['Docker'],['CI/CD']),
  app(6,'IT Support & Automation Intern','Brightwell Schools Trust','Hertford','applied',2,83,'IT Help Desk / Service Desk','Indeed','',['Internship','On-site'],None,['Windows 10/11','Active Directory','Python','Microsoft 365'],['Windows 10/11','Python'],['Active Directory','Microsoft 365'],[]),
  app(7,'Machine Learning Intern','Tidewater Health','London','noresponse',38,55,'AI / Machine Learning','LinkedIn','',['Internship','Remote'],['applied','noresponse'],['Python','scikit-learn','pandas','SQL'],['Python','SQL'],['pandas'],['scikit-learn']),
  app(8,'Backend Developer Intern','Ledgerly','London','applied',8,69,'Software Developer','Welcome to the Jungle','£25,000 per annum',['Internship','Hybrid'],None,['Python','FastAPI','PostgreSQL','Docker'],['Python'],['FastAPI','PostgreSQL'],['Docker']),
]
APPS[4]['offer'] = {'salary': '22500', 'pension': '5', 'hours': '30', 'days': '4', 'mode': 'Hybrid', 'officeDays': '2', 'commuteMin': '40', 'commuteCost': '120', 'holiday': '25', 'training': '500', 'contract': 'Fixed-term', 'gut': '4'}
