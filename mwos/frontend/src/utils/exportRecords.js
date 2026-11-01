export function csvText(headers, rows) {
 const cell = value => {let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'}
 return '\ufeff'+[headers,...rows].map(row=>row.map(cell).join(',')).join('\r\n')
}
export function downloadText(name, text, type='text/csv;charset=utf-8') {
 const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
