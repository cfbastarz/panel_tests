importScripts("https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/wheels/bokeh-3.3.4-py3-none-any.whl', 'https://cdn.holoviz.org/panel/1.3.8/dist/wheels/panel-1.3.8-py3-none-any.whl', 'pyodide-http==0.2.1', 'https://files.pythonhosted.org/packages/a9/fc/f2daa47260663cec3dd0a4c9f0592f27591d84d77f1178662010edb97aa6/hvplot-0.9.2-py2.py3-none-any.whl', 'https://files.pythonhosted.org/packages/9a/1e/2a53d93716bae3b006ae27eee519c9fb4ada278d1ea6b12ed856c51aed65/intake-0.7.0-py3-none-any.whl', 'pandas', 'xarray', 'https://files.pythonhosted.org/packages/73/64/ca8e8ba5435c3229a72e04618a469602af2fa51038b487399463e2164c6d/intake_xarray-0.7.0-py3-none-any.whl', 'distutils']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

#!/usr/bin/env python
# coding: utf-8

# In[1]:


import os
import xarray as xr
import hvplot.xarray
import pandas as pd
import panel as pn
import intake


# In[7]:


Regs = ['gl', 'hn', 'tr', 'hs', 'as']
Exps = ['DTC']
Stats = ['RMSE', 'VIES', 'MEAN']

data = '20230216002023030300'


# In[3]:


catalog = intake.open_catalog('https://raw.githubusercontent.com/cfbastarz/panel_tests/main/catalog.yml')
#catalog = intake.open_catalog('catalog.yml')


# In[4]:


ds1 = catalog.scantec_gl_rmse_dtc.to_dask()


# In[5]:


ds1


# In[8]:


Vars = list(ds1.variables)
Vars.remove('time')
Vars.remove('lat')
Vars.remove('lon')

variable_list = Vars
variable = pn.widgets.Select(name='Variable', value=variable_list[0], options=variable_list)

region = pn.widgets.Select(name='Region', value=Regs[0], options=Regs)
experiment = pn.widgets.Select(name='Experiment', value=Exps[0], options=Exps)
statistic = pn.widgets.Select(name='Statistic', value=Stats[0], options=Stats)

test_list = ['ref_GFS', 'ref_Era5', 'ref_PAnl']
test = pn.widgets.Select(name='Reference', value=test_list[0], options=test_list)

@pn.depends(variable, region, experiment, statistic, test)
def plotFields(variable, region, experiment, statistic, test):
    if test == 'ref_GFS': ttest = 'T1'
    if test == 'ref_Era5': ttest = 'T2'
    if test == 'ref_PAnl': ttest = 'T3'
    lfname = 'scantec_' + region.lower() + '_' + statistic.lower() + '_' + experiment.lower()
    dfs = catalog[lfname].to_dask()
    cmin=dfs[variable].min()
    cmax=dfs[variable].max()
    cmap='tab20c_r'
    if region == 'as': 
        frame_width=500
    else: 
        frame_width=960
    ax = dfs[variable].hvplot(groupby='time', clim=(cmin, cmax), widget_type='scrubber', widget_location='bottom', 
                              frame_width=frame_width, cmap=cmap)
    return pn.Column(ax, sizing_mode='stretch_width')

card_parameters = pn.Card(variable, region, experiment, statistic, test, title='Parameters', collapsed=False)

settings = pn.Column(card_parameters)

pn.template.FastListTemplate(
    site="My Dashboard", title="panel_tests", sidebar=[settings],
    main=["My test.", plotFields], 
).servable();


# In[ ]:






await write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.globals.set('patch', msg.patch)
    self.pyodide.runPythonAsync(`
    state.curdoc.apply_json_patch(patch.to_py(), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.globals.set('location', msg.location)
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads(location)
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()
